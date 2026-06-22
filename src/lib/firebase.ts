import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, collection, setDoc, getDocs, deleteDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Also setting up Firestore database to use it later
export const firestoreDb = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

const provider = new GoogleAuthProvider();
// Request Google Workspace Scopes
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/documents');
provider.addScope('https://www.googleapis.com/auth/gmail.modify');
provider.addScope('https://www.googleapis.com/auth/gmail.send');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/chat.messages');
provider.addScope('https://www.googleapis.com/auth/chat.spaces');
provider.addScope('https://www.googleapis.com/auth/tasks');
provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
provider.addScope('https://www.googleapis.com/auth/presentations.readonly');
provider.addScope('https://www.googleapis.com/auth/keep');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const syncUserProfile = async (user: User) => {
  const path = `users/${user.uid}`;
  try {
    const userDocRef = doc(firestoreDb, 'users', user.uid);
    await setDoc(userDocRef, {
      uid: user.uid,
      displayName: user.displayName || '',
      email: user.email || '',
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const saveHistoryToFirestore = async (userId: string, entry: any) => {
  const path = `users/${userId}/history/${entry.id}`;
  try {
    const entryDocRef = doc(firestoreDb, 'users', userId, 'history', entry.id);
    const sanitizedEntry = {
      id: entry.id,
      userId: userId,
      fileName: entry.fileName || 'unnamed',
      date: entry.date || new Date().toISOString(),
      complianceScore: Number(entry.complianceScore || 0),
      passedCount: Number(entry.passedCount || 0),
      failedCount: Number(entry.failedCount || 0),
      partialCount: Number(entry.partialCount || 0),
      fullReport: entry.fullReport || null
    };
    await setDoc(entryDocRef, sanitizedEntry);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const deleteHistoryFromFirestore = async (userId: string, entryId: string) => {
  const path = `users/${userId}/history/${entryId}`;
  try {
    const entryDocRef = doc(firestoreDb, 'users', userId, 'history', entryId);
    await deleteDoc(entryDocRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const loadHistoryFromFirestore = async (userId: string): Promise<any[]> => {
  const path = `users/${userId}/history`;
  try {
    const historyRef = collection(firestoreDb, 'users', userId, 'history');
    const snapshot = await getDocs(historyRef);
    const entries: any[] = [];
    snapshot.forEach(doc => {
      entries.push(doc.data());
    });
    return entries.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
};

export const testConnection = async () => {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

