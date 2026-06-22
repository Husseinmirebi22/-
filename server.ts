/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import cron from 'node-cron';
import { google } from 'googleapis';

dotenv.config();

const app = express();
const PORT = 3000;

// Load File Extensions Reference Database (v2.1)
let extDatabase: any = null;
try {
  const dbPath = path.join(process.cwd(), 'src', 'file_extensions_reference_db_v2.1.json');
  if (fs.existsSync(dbPath)) {
    extDatabase = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    console.log(`Successfully loaded extensions reference database v2.1 with ${extDatabase?.metadata?.total_extensions} extensions.`);
  } else {
    console.warn(`Database file not found at ${dbPath}`);
  }
} catch (err) {
  console.error('Failed to load file extensions reference database:', err);
}

// Load Enriched File Extensions Database (v2.1) for Scientific & Medical classifications
let enrichedDatabase: any = null;
try {
  const enrichedPath = path.join(process.cwd(), 'src', 'extensions_enriched_v2.1.json');
  if (fs.existsSync(enrichedPath)) {
    enrichedDatabase = JSON.parse(fs.readFileSync(enrichedPath, 'utf8'));
    console.log(`Successfully loaded enriched extensions database with ${enrichedDatabase?.extensions?.length} records.`);
  } else {
    console.warn(`Enriched Database file not found at ${enrichedPath}`);
  }
} catch (err) {
  console.error('Failed to load enriched extensions database:', err);
}

// Allow parsing larger payloads (for big documents or ZIP files)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper to initialize Gemini SDK lazily to prevent server crashes if key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === '') {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// PROGRAMMATIC AUDITORS (Fast, reliable, works without API Key)
function runProgrammaticAudit(fileName: string, content: string, size: number) {
  const lines = content.split('\n');
  const items: any[] = [];
  const topFixes: any[] = [];

  // Default statuses
  const statusObject: Record<string, { status: 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_APPLICABLE', reasoning?: string, recommendation?: string, lineNumbers?: number[] }> = {};

  // Initialize all programmatic items
  const programmaticIds = [
    "1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.1.5", "1.1.8", "1.1.9", "1.1.10",
    "1.2.1", "1.2.2", "1.2.3", "1.3.1",
    "2.1.1", "2.1.2", "2.1.3", "2.1.4", "2.2.3", "2.3.2",
    "3.1.5", "3.2.6", "3.2.7", "4.3.1", "5.2.1"
  ];

  for (const id of programmaticIds) {
    statusObject[id] = { status: 'PASS', reasoning: 'تم الفحص التلقائي ونجح الملف في اجتياز البند.', recommendation: '' };
  }

  // 1.2.2 File naming standard
  // Standard format: [id]_[name]_v[version].extension (example: HR-POL-105_سياسة-السفر_v2.1.md)
  const nameWithNoExt = fileName.substring(0, fileName.lastIndexOf('.'));
  const fileExt = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
  
  const namingRegex = /^[A-Z0-9-]+_[A-Za-z0-9\u0600-\u06FF-]+_v\d+(\.\d+)?$/;
  const isNamingValid = namingRegex.test(nameWithNoExt);
  
  if (!isNamingValid) {
    statusObject["1.2.2"] = {
      status: 'FAIL',
      reasoning: `اسم الملف الحالي (${fileName}) لا يتبع التسمية المعتمدة في بروتوكول هندسة المعرفة.`,
      recommendation: "أعد تسمية الملف وفق الصيغة: [الرمز]_[الوصف]_v[الإصدار].md. مثال: HR-POL-105_سياسة-السفر_v2.1.md"
    };
  }

  // 1.2.1 File Formats using Reference Database
  let foundGroup: any = null;
  if (extDatabase && extDatabase.groups) {
    foundGroup = extDatabase.groups.find((g: any) => 
      g.extensions.includes(fileExt)
    );
  }

  // Look in enriched database (Scientific & Medical schemas)
  let enrichedInfo: any = null;
  if (enrichedDatabase && enrichedDatabase.extensions) {
    enrichedInfo = enrichedDatabase.extensions.find((e: any) => e.extension === fileExt);
  }

  if (enrichedInfo) {
    const riskLabel = enrichedInfo.security_risk === 'high' ? 'عالية الحساسية والمخاطر 🚨' : enrichedInfo.security_risk === 'medium' ? 'متوسطة الحساسية ⚠️' : 'آمنة ومثبتة';
    const convMsg = enrichedInfo.can_be_converted_to_markdown ? 'قابل وجاهز للتحويل الهيكلي لـ Markdown.' : 'صيغة ثنائية أو مع البيانات الحيوية، لا تحول مباشرة بل عبر مفرغات أو أدوات استخلاص المعرفة.';
    
    let processableStatus: 'PASS' | 'PARTIAL' | 'FAIL' = 'PASS';
    if (enrichedInfo.processability === 'binary_not_processable') {
      processableStatus = 'FAIL';
    } else if (enrichedInfo.processability === 'extractable') {
      processableStatus = 'PARTIAL';
    }

    statusObject["1.2.1"] = {
      status: processableStatus,
      reasoning: `تم الفحص الدقيق بالرجوع لبروتوكول المعرفة الموحد والامتدادات المثرية v2.1. نوع المستند المرفوع: [${enrichedInfo.type}] ضمن عائلة: "${enrichedInfo.group_name}". الحساسية الأمنية: [${riskLabel}]. ${enrichedInfo.notes}`,
      recommendation: `الأداة المفضلة للفحص: (${enrichedInfo.extraction_tool || 'معالجة نصية مباشرة بقارئ النظام'}). الطريقة: (${enrichedInfo.extraction_method || 'مسح دلالي'}). التوجيه: ${convMsg} ` + (enrichedInfo.preprocessing_steps.length ? `الخطوات التمهيدية للإعداد: [${enrichedInfo.preprocessing_steps.join(', ')}].` : '')
    };
  } else if (foundGroup) {
    const isNativeRAGType = ['md', 'json', 'jsonl', 'txt'].includes(fileExt);
    if (isNativeRAGType) {
      statusObject["1.2.1"] = {
        status: 'PASS',
        reasoning: `تم التعرف تلقائياً على صيغة الملف (${fileExt.toUpperCase()}) كجزء من مجموعة [${foundGroup.name}] (${foundGroup.name_en}). هذه الصيغة مدعومة بالكامل وموصى بها مباشرة في أنظمة الـ RAG والأنظمة الذكية.`,
        recommendation: "صيغة الملف ممتازة وصالحة للتضمين اللغوي الفوري."
      };
    } else {
      // Document group but non-native
      if (foundGroup.id === 1) { // Text and Documents
        const isSpreadsheet = ['xls', 'xlsx', 'ods', 'numbers'].includes(fileExt);
        statusObject["1.2.1"] = {
          status: 'PARTIAL',
          reasoning: `تم التعرف على الملف كوثيقة مكتبية (${fileExt.toUpperCase()}) من مجموعة [${foundGroup.name}]. المستند يحمل محتوى معرفياً قيماً ولكنه غير مهيأ آلياً بصيغته الحالية للتقطيع والترميز مباشرة دون فك ترميز معقد.`,
          recommendation: isSpreadsheet 
            ? "يفضل تصدير البيانات الجدولية إلى صيغة JSON لحفظ العلاقات المنظمة، أو تحويل السطور لفقرات مرقمة تصف الأرقام دلالياً."
            : `قم بتحويل محتوى الملف من (${fileExt.toUpperCase()}) إلى صيغة Markdown (.md) أو نص عادي (.txt) لتبسيط المعالجة وتعظيم دقة التضمين دلالياً.`
        };
      } 
      // Image group
      else if (foundGroup.id === 2) {
        statusObject["1.2.1"] = {
          status: 'FAIL',
          reasoning: `الملف المرفوع هو صورة (${fileExt.toUpperCase()}) تابعة لمجموعة [${foundGroup.name}]. صور البكسلات لا يمكن فهمها وتضمينها دلالياً مباشرة في أجهزة الاسترجاع دون تحويل للبيانات.`,
          recommendation: "استخدم معالج قارئ بصري (OCR) أو نموذج رؤية حاسوبية (Generative Vision Model) لاستخلاص المادة النصية وحفظها في صيغة Markdown، مع استغلال الأوصاف البديلة للحقائق المصورة."
        };
      }
      // Videos & Audio
      else if (foundGroup.id === 3 || foundGroup.id === 4) {
        statusObject["1.2.1"] = {
          status: 'FAIL',
          reasoning: `تم التعرف على الملف كملف وسائط مسموعة/مرئية (${fileExt.toUpperCase()}) من مجموعة [${foundGroup.name}]. هذه القوالب تتطلب مفرغات لغوية لتحويل الحوار الصوتي لكلمات سردية صالحة للتقطيع والتضمين.`,
          recommendation: "قم بتفريغ المقطع صوتياً (Audio Transcription) عبر تقنيات مثل Whisper، ثم قم بتنظيم المستند الناتج بصيغة Markdown ورفعه للتدقيق."
        };
      }
      // Programming
      else if (foundGroup.id === 5) {
        statusObject["1.2.1"] = {
          status: 'PARTIAL',
          reasoning: `الملف المعطى كود برمجي (${fileExt.toUpperCase()}) يثبت تبعيته لمجموعة [${foundGroup.name}]. الأكواد البرمجية حساسة لتقسيم الأسطر العشوائي مما يهدد بفساد منطق الدوال والتعليقات.`,
          recommendation: "يُنصح بتقطيع الملف تقنياً بالاعتماد على خوارزميات تقطيع الكود (AST / Code Chunkers) لتقطيع الدوال ككتل كاملة دون بترها، وإثراء الكود بتعليقات توضيحية غنية."
        };
      }
      // Databases
      else if (foundGroup.id === 6) {
        statusObject["1.2.1"] = {
          status: 'PARTIAL',
          reasoning: `الملف المرفوع يمثل قاعدة بيانات أو صيغة مهيكلة للبيانات (${fileExt.toUpperCase()}) من مجموعة [${foundGroup.name}]. البيانات المنظمة لها طبيعة مستودعية تسبب تشتت متجهات المعنى والروابط إذا فُككت بشكل سردي عشوائي.`,
          recommendation: "قم بتحويل محتويات قاعدة البيانات إلى مصفوفات JSON منظمة أو أسطر JSONL محددة لضمان بقاء العلاقات والصلات الدلالية بين البيانات بوضوح."
        };
      }
      // All other groups (configuration, design, secure, apple, etc.)
      else {
        statusObject["1.2.1"] = {
          status: 'FAIL',
          reasoning: `امتداد الملف (${fileExt.toUpperCase()}) يندرج تحت مجموعة [${foundGroup.name}] (${foundGroup.name_en}). هذا النوع من الهياكل ليس مادة معرفية سردية تدعم طبيعة وبحث التضمين الدلالي في نظم RAG.`,
          recommendation: "يرجى مراجعة محتوى الملف، وإذا كنت تود الاستعانة بحقائق داخله، انقل تلك المعارف إلى ملف Markdown مهيكل ومصنف بوضوح."
        };
      }
    }
  } else {
    // Unknown extension
    statusObject["1.2.1"] = {
      status: 'FAIL',
      reasoning: `الملف يحتوي على امتداد غريب أو غير مدعوم (.${fileExt}) لم يتم كشفه في قاعدة بيانات الامتدادات المرجعية الشاملة (987 امتداداً).`,
      recommendation: "لتجنب مشاكل المعالجة والترميز، غير صيغة الملف إلى Markdown (.md) للمستندات السردية أو JSON للمصفوفات المنظمة."
    };
  }

  // 1.2.3 UTF-8 Encoding
  // Simple check for common broken characters or Arabic character range
  const hasArabic = /[\u0600-\u06FF]/.test(content);
  if (content.includes('')) {
    statusObject["1.2.3"] = {
      status: 'FAIL',
      reasoning: "تم العثور على محارف مشوهة () مما يشير لعيب في الترميز.",
      recommendation: "قم بحفظ المستند بترميز UTF-8 دون BOM (بدون علامة ترتيب البايتات)."
    };
  } else {
    statusObject["1.2.3"] = {
      status: 'PASS',
      reasoning: `المستند مخزن بترميز UTF-8 سليم ومتوافق مع النظم اللغوية.${hasArabic ? ' يحتوي على محتوى عربي.' : ''}`
    };
  }

  // 1.3.1 YAML Front Matter Check (Markdown specifically)
  let hasYaml = false;
  let yamlFields: Record<string, string> = {};
  
  if (fileExt === 'md') {
    const hasYamlStart = content.startsWith('---');
    if (hasYamlStart) {
      // Find where next --- is
      const nextDashIdx = content.indexOf('---', 3);
      if (nextDashIdx !== -1) {
        hasYaml = true;
        const yamlBlock = content.substring(3, nextDashIdx);
        const yamlLines = yamlBlock.split('\n');
        yamlLines.forEach(l => {
          const colonIdx = l.indexOf(':');
          if (colonIdx !== -1) {
            const key = l.substring(0, colonIdx).trim().toLowerCase();
            const value = l.substring(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
            yamlFields[key] = value;
          }
        });
      }
    }

    if (!hasYaml) {
      statusObject["1.3.1"] = {
        status: 'FAIL',
        reasoning: "المستند يفتقر لوجود قالب YAML Front Matter التعريفي في مطلع سطوره.",
        recommendation: "أضف كتلة YAML Front Matter في مطلع السطر الأول بين فاصلتي ---."
      };
      // Mark metadata details as FAIL because of no YAML
      ["1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.1.5", "1.1.8", "1.1.9", "1.1.10", "5.2.1"].forEach(id => {
        statusObject[id] = {
          status: 'FAIL',
          reasoning: "يتعذر التحقق لعدم وجود قالب بيانات YAML بالمستند.",
          recommendation: "يرجى إنشاء وتضمين قالب YAML الموسع لحل هذا البند."
        };
      });
    } else {
      statusObject["1.3.1"] = {
        status: 'PASS',
        reasoning: "تم العثور على كتلة بيانات YAML Front Matter منظمة في مطلع الملف."
      };

      // Check specific fields
      const checkYamlField = (itemId: string, fieldName: string, successCriteria: string, regex?: RegExp) => {
        const val = yamlFields[fieldName];
        if (!val) {
          statusObject[itemId] = {
            status: 'FAIL',
            reasoning: `المعلم الوصفي [${fieldName}] مفقود من مصفوفة YAML.`,
            recommendation: `أضف حقل ${fieldName} في قالب YAML. مثال: ${fieldName}: "${successCriteria}"`
          };
        } else if (regex && !regex.test(val)) {
          statusObject[itemId] = {
            status: 'PARTIAL',
            reasoning: `المعلم الوصفي [${fieldName}] متواجد ولكن قيمته (${val}) لا توافي المعيار النموذجي للبروتوكول.`,
            recommendation: `قم بتعديل حقل ${fieldName} ليطابق المعيار. مثال: "${successCriteria}"`
          };
        } else {
          statusObject[itemId] = {
            status: 'PASS',
            reasoning: `تم العثور على حقل [${fieldName}] بقيمة مطابقة ومؤمنة: (${val}).`
          };
        }
      };

      checkYamlField("1.1.1", "title", "سياسة السفر والإقامة");
      checkYamlField("1.1.2", "doc_id", "HR-POL-105", /^[A-Z0-9-]+$/);
      checkYamlField("1.1.3", "version", "1.0", /^\d+(\.\d+)?$/);
      checkYamlField("1.1.4", "last_updated", "2026-06-08", /^\d{4}-\d{2}-\d{2}$/);
      checkYamlField("1.1.5", "owner", "إدارة الموارد البشرية");
      checkYamlField("1.1.8", "summary", "ملخص من سطرين يصف غاية الملف");
      checkYamlField("1.1.9", "language", "ar", /^[a-z]{2}$/);
      checkYamlField("1.1.10", "security_level", "داخلي");
      checkYamlField("5.2.1", "chunking_strategy", "بالعناوين H2");
    }
  } else {
    // Non Markdown files might not require YAML Front Matter but check relevance
    ["1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.1.5", "1.1.8", "1.1.9", "1.1.10", "1.3.1", "5.2.1"].forEach(id => {
      statusObject[id] = {
        status: 'NOT_APPLICABLE',
        reasoning: "هذا البند خاص بملفات التوثيق اللغوية Markdown ولا تنطبق على بنية الفايل الحالية."
      };
    });
  }

  // 2. Headings hierarchy and formatting (Markdown only)
  if (fileExt === 'md') {
    let h1Count = 0;
    const headingLevels: { line: number, text: string, level: number }[] = [];
    const headingsSet = new Set<string>();
    let duplicateHeadings: string[] = [];

    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        
        if (level === 1) h1Count++;
        headingLevels.push({ line: index + 1, text, level });

        if (headingsSet.has(text)) {
          duplicateHeadings.push(text);
        } else {
          headingsSet.add(text);
        }
      }
    });

    // 2.1.1 Headline
    if (h1Count === 0) {
      statusObject["2.1.1"] = {
        status: 'FAIL',
        reasoning: "المستند لا يحتوي على عنوان رئيسي من المستوى الأول (#).",
        recommendation: "أضف عنوان رئيسي واحد فقط يعبر عن اسم الملف الرئيسي في مطلع الملف بقيمة # ."
      };
    } else if (h1Count > 1) {
      statusObject["2.1.1"] = {
        status: 'FAIL',
        reasoning: `المستند يحتوي على كثرة عناوين للـ H1 (تم العثور على ${h1Count}) مما يفسد التضمين.`,
        recommendation: "احتفظ بعنوان H1 واحد فقط مطلع الملف، وحول العناوين الكبرى الأخرى لعناوين فرعية H2 (##)."
      };
    } else if (headingLevels.length > 0 && headingLevels[0].level !== 1) {
      statusObject["2.1.1"] = {
        status: 'PARTIAL',
        reasoning: "العنوان الرئيسي الأول في الملف ليس من المستوى الأول H1.",
        recommendation: "تأكد من أن أول عنوان يظهر في ملفك هو # واسم المستند مباشرة."
      };
    } else {
      statusObject["2.1.1"] = {
        status: 'PASS',
        reasoning: "يحتوي المستند على عنوان H1 متفرد وسليم في موضع ريادي."
      };
    }

    // 2.1.2 Skipped levels
    let hasSkipped = false;
    let skippedDetails = "";
    for (let i = 1; i < headingLevels.length; i++) {
      const prev = headingLevels[i-1].level;
      const curr = headingLevels[i].level;
      if (curr > prev + 1) {
        hasSkipped = true;
        skippedDetails += `سطر ${headingLevels[i].line}: قفزة من المستوي ${prev} إلى ${curr}. `;
      }
    }

    if (hasSkipped) {
      statusObject["2.1.2"] = {
        status: 'FAIL',
        reasoning: `تم العثور على تجاوز وقفز بمستويات العناوين: ${skippedDetails}`,
        recommendation: "قم بتعديل صياغة وسوم العناوين لتتدرج بشكل صحيح (على سبيل المثال، لا تضع عنوان ### مباشرة تحت ## دون مبرر هرمي)."
      };
    } else {
      statusObject["2.1.2"] = {
        status: 'PASS',
        reasoning: "تتسلسل العناوين اللغوية في صفوف الـ AST بتدرج هرمي ممتاز دون قفزات."
      };
    }

    // 2.1.3 Heading Length
    const longHeadings = headingLevels.filter(h => h.text.split(/\s+/).length > 10);
    if (longHeadings.length > 0) {
      statusObject["2.1.3"] = {
        status: 'FAIL',
        reasoning: `بعض أقسام العناوين طويلة جداً وتتجاوز 10 كلمات. أسطر: ${longHeadings.map(h => h.line).join(', ')}`,
        recommendation: "أعد صوغ العناوين الطويلة لتصبح موجزة ومباشرة وتصف الفصل في دلالة تحت 10 كلمات."
      };
    } else {
      statusObject["2.1.3"] = {
        status: 'PASS',
        reasoning: "جميع أطوال العناوين الفرعية منسقة وتحت سقف الـ 10 كلمات الدلالية."
      };
    }

    // 2.1.4 Duplicate Headings
    if (duplicateHeadings.length > 0) {
      statusObject["2.1.4"] = {
        status: 'FAIL',
        reasoning: `الملف يحتوي على عناوين مكررة بنفس الصياغة اللفظية: [${duplicateHeadings.join(', ')}]`,
        recommendation: "أضف سياقاً مميزاً لكل عنوان مكرر لتجنب تشابه الـ Chunks المبتناة دلالياً."
      };
    } else {
      statusObject["2.1.4"] = {
        status: 'PASS',
        reasoning: "تتصف العناوين بالانفراد التام مع تنوع فريد يعزز تماسك البحث."
      };
    }

    // 2.2.3 Columns inside text tables
    let invalidTables = [];
    let tableLine = 0;
    let insideTable = false;
    let colCount = 0;

    lines.forEach((line, index) => {
      const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');
      if (isTableRow) {
        if (!insideTable) {
          insideTable = true;
          tableLine = index + 1;
        }
        const cols = line.split('|').filter(c => c.trim() !== '').length;
        colCount = Math.max(colCount, cols);
      } else {
        if (insideTable) {
          if (colCount > 6) {
            invalidTables.push({ line: tableLine, cols: colCount });
          }
          insideTable = false;
          colCount = 0;
        }
      }
    });

    if (invalidTables.length > 0) {
      statusObject["2.2.3"] = {
        status: 'FAIL',
        reasoning: `تم العثور على جداول تتجاوز الحد الأقصى للأعمدة (6 أعمدة). أسطر: ${invalidTables.map(t => `${t.line} (${t.cols} عمود)`).join(', ')}`,
        recommendation: "قلل أبعاد الجداول بدمج الأعمدة أو تحويلها لقائمتين فرعيتين لتناسب حجم القطعة الناجمة."
      };
    } else {
      statusObject["2.2.3"] = {
        status: 'PASS',
        reasoning: "الجداول داخل النص متسقة ومثالية الأبعاد وتكفل استرجاعاً دون تشتت السطور."
      };
    }

    // 2.3.2 Spacings and empty lines
    let multipleEmptyLines = false;
    let badSpacingLines = [];
    lines.forEach((line, index) => {
      if (index > 0 && line.trim() === '' && lines[index-1].trim() === '') {
        const checkTwoSpacings = index > 1 && lines[index-2].trim() === '';
        if (checkTwoSpacings) {
          multipleEmptyLines = true;
          badSpacingLines.push(index + 1);
        }
      }
    });

    if (multipleEmptyLines) {
      statusObject["2.3.2"] = {
        status: 'FAIL',
        reasoning: `تم رصد مساحات فارغة متتالية تزيد عن سطرين متتالين تشوه بنية الفواصل. أسطر: ${badSpacingLines.slice(0, 5).join(', ')}..`,
        recommendation: "قم بتشذيب الملف وإزالة الأسطر البيضاء الفارغة المتتالية والإبقاء على سطر فارغ واحد فقط."
      };
    } else {
      statusObject["2.3.2"] = {
        status: 'PASS',
        reasoning: "تمتلك الفواصل البينية اتساقاً رائعاً يدعم مرونة القراءة الآلية."
      };
    }
  } else {
    ["2.1.1", "2.1.2", "2.1.3", "2.1.4", "2.2.3", "2.3.2"].forEach(id => {
      statusObject[id] = {
        status: 'NOT_APPLICABLE',
        reasoning: "هذا البند ينطبق فقط على البنية الهرمية لملفات Markdown."
      };
    });
  }

  // 3. Cognitive content quality - programmatic checks
  // 3.1.5 Paragraph max length
  if (fileExt === 'md' || fileExt === 'txt') {
    const paragraphs = content.split(/\n\s*\n/);
    const longParagraphs = [];
    paragraphs.forEach((p, idx) => {
      const words = p.trim().split(/\s+/).filter(w => w !== '');
      if (words.length > 300) {
        longParagraphs.push({ idx: idx + 1, count: words.length });
      }
    });

    if (longParagraphs.length > 0) {
      statusObject["3.1.5"] = {
        status: 'FAIL',
        reasoning: `عثرنا على فقرات متضخمة تتجاوز 300 كلمة (تأثير سلبي على البحث الدلالي). عددها: ${longParagraphs.length} فقرة. أكبر فقرة تبلغ ${longParagraphs[0].count} كلمة.`,
        recommendation: "قسم الفقرات الطويلة إلى فقرات أصغر تركز كل منها على فكرة واحدة مستقلة تخدم جودة المتجهات الدلالية."
      };
    } else {
      statusObject["3.1.5"] = {
        status: 'PASS',
        reasoning: "جميع أطوال الفقرات تحت سقف 300 كلمة، مما يسهل تقطيعها آلياً وتخزينها في قاعدة المدخلات."
      };
    }
  } else {
    statusObject["3.1.5"] = {
      status: 'NOT_APPLICABLE',
      reasoning: "هذا الفحص مخصص للفقرات السردية في مستندات النصوص."
    };
  }

  // 3.2.6 Cleanliness (Emojis, page numbers, weird signs)
  const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/g;
  const nonStdSymbolsRegex = /[※§¶†‡]/g;
  const pageNoRegex = /(الصفحة|صفحة|page|Page)\s*\d+/g;

  const foundEmojis = content.match(emojiRegex);
  const foundSymbols = content.match(nonStdSymbolsRegex);
  const foundPageNos = content.match(pageNoRegex);

  let noiseDetail = [];
  if (foundEmojis) noiseDetail.push(`رموز تعبيرية (${foundEmojis.length} مرة)`);
  if (foundSymbols) noiseDetail.push(`علامات غير قياسية [${Array.from(new Set(foundSymbols)).join(', ')}]`);
  if (foundPageNos) noiseDetail.push(`أرقام صفحات (${foundPageNos.length} مرة)`);

  if (noiseDetail.length > 0) {
    statusObject["3.2.6"] = {
      status: 'FAIL',
      reasoning: `تم العثور على ضجيج نصي يشوش جودة التضمين الدلالي: ${noiseDetail.join('، ')}.`,
      recommendation: "استخدم ميزة 'التنظيف التلقائي' لإزالة الرموز التعبيرية المشوشة، وعلامات الفقرات والصفحات بالكامل من صلب المعرفة."
    };
  } else {
    statusObject["3.2.6"] = {
      status: 'PASS',
      reasoning: "الملف نظيف تماماً وخالٍ من الرموز التعبيرية، أو علامات الصفحات العشوائية."
    };
  }

  // 3.2.7 East Arab Numbers (Hindi Arabic ١، ٢، ٣)
  const arabicNumeralsRegex = /[٠١٢٣٤٥٦٧٨٩]/g;
  const foundArabicNums = content.match(arabicNumeralsRegex);
  if (foundArabicNums) {
    statusObject["3.2.7"] = {
      status: 'FAIL',
      reasoning: `الملف يخلط استخدام الأرقام ويحتوي على أرقام شرقية/هندية [مثال: ${foundArabicNums.slice(0, 5).join(', ')}] (إجمالي ${foundArabicNums.length} رقم).`,
      recommendation: "قم بتعديل كافة الأرقام وتوحيد صياغتها بالنمط الغربي العادي (123)."
    };
  } else {
    statusObject["3.2.7"] = {
      status: 'PASS',
      reasoning: "جميع الأرقام الواردة موحدة على النمط العربي الغربي الشائع (123) وجاهزة للتحليل الرقمي."
    };
  }

  // 4.3.1 Change log (سجل التغييرات)
  const logMatch = content.match(/(سجل التغييرات|سجل التعديلات|جدول التعديلات|تاريخ النسخ|changlog|change log)/i);
  if (fileExt === 'md') {
    if (!logMatch) {
      statusObject["4.3.1"] = {
        status: 'FAIL',
        reasoning: "لم يُعثر على قسم مخصص لتتبع وسجل التغييرات وتدرج الإصدارات في ختام المستند.",
        recommendation: "أضف قسم باسم '## سجل التغييرات' في نهاية المستند يتضمن جدولاً للمراجعات (التاريخ، الإصدار، الوصف)."
      };
    } else {
      statusObject["4.3.1"] = {
        status: 'PASS',
        reasoning: "تم العثor على قسم 'سجل التغييرات' مدمج في ختام المستند لتسهيل دورة الحوكمة المعرفية."
      };
    }
  } else {
    statusObject["4.3.1"] = {
      status: 'NOT_APPLICABLE',
      reasoning: "هذا الفحص خاص بالحوكمة الزمنية لملفات الهرم السردي."
    };
  }

  // Create formatted list of top fixes based on programmatic fails
  Object.keys(statusObject).forEach(id => {
    const o = statusObject[id];
    if (o.status === 'FAIL') {
      topFixes.push({
        itemId: id,
        chapterId: Math.floor(parseFloat(id)),
        name: "", // Will populate later from templates
        priority: id === "5.2.1" || id === "6.1.1" || id === "6.2.1" ? "SHOULD_HAVE" : "MUST_HAVE",
        recommendation: o.recommendation || ""
      });
    }
  });

  return {
    statusObject,
    topFixes,
    fileGroup: foundGroup ? foundGroup.name : 'امتداد غير مصنف',
    fileGroupEn: foundGroup ? foundGroup.name_en : 'Unclassified extension'
  };
}

// RESTORE AUTO FIX GENERATOR
function getCleanedAndFixedContent(fileName: string, content: string) {
  let cleaned = content;
  const fileExt = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();

  // 1. Convert carriage returns to LF
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Erase emojis
  const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/g;
  cleaned = cleaned.replace(emojiRegex, '');

  // 3. Remove weird symbols
  const nonStdSymbolsRegex = /[※§¶†‡]/g;
  cleaned = cleaned.replace(nonStdSymbolsRegex, '');

  // 4. Translate Eastern numerals to standard (0-9)
  const numMap: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  cleaned = cleaned.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (m) => numMap[m] || m);

  // 5. Clean too many blank spacer lines (reduce >2 to exactly 1 blank line, i.e. max 2 newlines)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 6. Generate missing / boilerplate YAML
  if (fileExt === 'md' && !cleaned.startsWith('---')) {
    const nameWithNoExt = fileName.substring(0, fileName.lastIndexOf('.'))
      .replace(/_/g, ' ')
      .replace(/v\d+(\.\d+)?/gi, '')
      .trim();
    
    const templateYaml = `---
title: "${nameWithNoExt || "عنوان المستند الوصفي"}"
doc_id: "DOC-KB-${Math.floor(100 + Math.random() * 900)}"
version: "1.0"
last_updated: "${new Date().toISOString().split('T')[0]}"
owner: "إدارة هندسة المعرفة"
tags: [معرفة, توثيق, دليل]
audience: [جميع_الموظفين]
type: "سياسة"
summary: "تم إعداد هذا المستند كملف معرفي آمن للاستخدام في محركات الـ RAG والأنظمة الذكية."
output_format: "نقاط محددة"
security_level: "داخلي"
review_cycle: "سنوي"
language: "ar"
chunking_strategy: "بالعناوين H2"
chunk_size: 512
overlap_ratio: 0.1
---

`;
    cleaned = templateYaml + cleaned;
  }

  // 7. Auto add change log at end if md and missing
  if (fileExt === 'md' && !cleaned.match(/(سجل التغييرات|سجل التعديلات|جدول التعديلات|changlog|change log)/i)) {
     cleaned += `\n\n---\n\n## سجل التغييرات\n\n| التاريخ | الإصدار | وصف التغيير | المسؤول |\n| :--- | :--- | :--- | :--- |\n| ${new Date().toISOString().split('T')[0]} | 1.0 | الإنشاء الأولي وتحسين الهيكل وتطهير المصطلحات | مدقق الملفات الذكي |\n`;
  }

  return cleaned;
}

// Safe JSON parser helper to handle potential markdown surrounds in Gemini responses
function safeJsonParse(str: string): any {
  let cleaned = (str || '').trim();
  
  // Remove markdown code block if present
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    } else {
      const lastFence = cleaned.lastIndexOf('```');
      if (lastFence !== -1) {
        cleaned = cleaned.substring(0, lastFence);
      }
    }
    cleaned = cleaned.trim();
  }

  // Find the outermost JSON curly braces if exist
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  return JSON.parse(cleaned);
}

// API LINGUISTIC AUDIT ROUTE
app.post('/api/linguistic-audit', async (req, res) => {
  const { fileName, content } = req.body;

  if (!fileName || !content) {
    return res.status(400).json({ error: 'اسم الملف والمحتوى مطلوبان لإجراء الفحص اللغوي.' });
  }

  try {
    const aiInstance = getGeminiClient();
    
    const prompt = `أنت في دور "المدقق والمصحح اللغوي الذكي الخبير" للمستندات المعرفية المكتوبة باللغة العربية.
مهمتك الأساسية هي مراجعة وتدقيق النص التالي بدقة فائقة من الناحية اللغوية، الإملائية، النحوية، الصياغية، وعلامات الترقيم.

اسم الملف: ${fileName}

النص المراد تدقيقه:
"""
${content.substring(0, 40000)} ${content.length > 40000 ? '\n... [تم اقتصار النص لطول الطيف]' : ''}
"""

التعليمات الأساسية:
1. قيّم الجودة اللغوية العامة للنص وأعطه درجة بحد أقصى 100 (overallLinguisticScore).
2. استخرج كافة الأجزاء التي تشتمل على أخطاء نحوية (مثال: ضبط أواخر الكلمات، جمع المذكر/المؤنث، المطابقة بين المبتدأ والخبر، إلخ) أو أخطاء إملائية (الهمزات، الياء والألف المقصورة، التاء المربوطة والمفتوحة) أو نقص علامات الترقيم أو صياغة ركيكة مستبعدة.
3. قدّم شرحاً مبسطاً وعلمياً بالعربية لكل خطأ تم اكتشافه.
4. وفّر كائناً يعبّر عن كامل المستند بعد إجراء التطهير اللغوي والتصحيح الشامل (suggestedCorrection)، مع الحفاظ التام والكامل والدقيق على نفس هيكلية المستند وعناوينه ومحتواه المعرفي والمعلومات الواردة فيه دون تأويل أو حذف أو إضافة حقائق وهمية.`;

    const response = await aiInstance.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallLinguisticScore: { type: Type.INTEGER, description: "درجة الجودة اللغوية الإجمالية من 0 إلى 100" },
            qualityEvaluation: { type: Type.STRING, description: "تقييم وصفي عام وموجز لمستوى اللغة العربية في المستند" },
            errors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING, description: "الكلمة أو الجملة التي تحتوي على الخطأ اللغوي" },
                  fixed: { type: Type.STRING, description: "الكلمة أو الجملة بعد تصحيح وتصويب الخطأ" },
                  type: { type: Type.STRING, description: "نوع الخطأ: grammar أو spelling أو punctuation أو style" },
                  explanation: { type: Type.STRING, description: "شرح وتوضيح مبسط للقاعدة اللغوية المتبعة في هذا التصحيح" }
                },
                required: ["original", "fixed", "type", "explanation"]
              },
              description: "قائمة بكافة الأخطاء اللغوية والنحوية والإملائية المكتشفة"
            },
            suggestedCorrection: { type: Type.STRING, description: "كامل نص المستند المرفق بعد تصحيح كافة الأخطاء النحوية والإملائية وبأفضل صياغة عربية بليغة دون حذف معلومات" }
          },
          required: ["overallLinguisticScore", "qualityEvaluation", "errors", "suggestedCorrection"]
        },
        temperature: 0.1,
      },
    });

    const resStr = response.text || '{}';
    const report = safeJsonParse(resStr);
    return res.json(report);

  } catch (err: any) {
    console.error('Linguistic Audit Failed:', err.message);
    if (err.message === 'GEMINI_API_KEY_MISSING') {
      return res.status(401).json({ error: 'مفتاح GEMINI_API_KEY مفقود أو غير صالح. يرجى تفعيله لإجراء الفحص اللغوي.' });
    }
    return res.status(500).json({ error: 'فشل إجراء الفحص اللغوي: ' + err.message });
  }
});

// API AUDIT ROUTE USING ADVANCED programmatical + Gemini combined audit
app.post('/api/audit', async (req, res) => {
  const { fileName, content, size, exploreMode } = req.body;

  if (!fileName || !content) {
    return res.status(400).json({ error: 'اسم الملف والمحتوى مطلوبان لإجراء الفحص.' });
  }

  const fileExt = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();

  // Run programmatic checks first (gives us immediate, robust structural analysis)
  const progResults = runProgrammaticAudit(fileName, content, size);

  // Build unified item database with descriptions
  const clientChecklist = JSON.parse(JSON.stringify(req.body.checklistItems || []));

  // Determine which items should be evaluated by Gemini
  // Usually semantic rules like Clichés (3.2.5), sensory (9.1.1), security (7.1.1, 7.2.1), consistency (3.1.2)
  const semanticIds = [
    "3.1.2", "3.2.5", "4.1.1", "4.2.1", "5.1.1", "6.1.1", "6.2.1", "7.1.1", "7.2.1", "8.1.1", "9.2.1", "9.5.1", "10.1.1"
  ];

  let geminiReport: any = null;
  let useAI = false;

  try {
    const aiInstance = getGeminiClient();
    useAI = true;

    // Send content to Gemini to audit semantic rules and extract entities/relations!
    // We request it in structured JSON
    const prompt = `أنت في دور "المستشار وعالم لغة المعرفة الذكي" وتعمل كجزء من تطبيق "مدقق الملفات الذكي". غايتك هي تحليل وفحص وتقييم المستند المرفق دلالياً وتشخيص مدى جاهزيته لنظم الذكاء الاصطناعي (RAG والوكلاء).
    
اسم الملف: ${fileName}
حجم المحتوى: ${size} بايت

المحتوى المراد تدقيقه:
\"\"\"
${content.substring(0, 40000)} ${content.length > 40000 ? '\n... [تم اقتصار النص لطول الطيف]' : ''}
\"\"\"

قم بتقييم البنود الدلالية التالية في المستند بدقة مستنداً لمعايير البروتوكول:
${semanticIds.map(id => `- البند [${id}]: ابحث عنه في صلب البروتوكول وقيّم النتيجة (PASS, FAIL, PARTIAL, NOT_APPLICABLE) مع تبرير علمي وصياغة لغوية ممتازة بالعربية وتوصية محددة بالإصلاح.`).join('\n')}

بالإضافة إلى ذلك، قم بأداء التالي في التقرير:
1. استخرج أهم 3 إصلاحات دلالية حرجة لرفع درجة جاهزية المستند (topFixes).
2. استخرج الكيانات الأساسية المتواجدة في صلب النص لـ Graph RAG (Entities، مثل: أشخاص ومصطلحات ووثائق وإدارات وأدوات ومواقع مع إسناد معرف فريد ونوع وتفصيل).
3. استخرج العلاقات والصلات الدلالية بين هذه الكيانات (Relations، صياغية مثل: سياسة_السفر تطبق_على الموظفين).

يجب صياغة الرد كملف JSON لغوي ممتاز وبصيغة مطابقة تماماً للمخطط التالي:
{
  "semanticScores": [
    {
      "id": "معرف البند مثل 3.1.2",
      "status": "PASS | FAIL | PARTIAL | NOT_APPLICABLE",
      "reasoning": "سبب منطقي واضح ودقيق باللغة العربية يشخص النص الحالي",
      "recommendation": "تعليمات واضحة وعريضة لكيفية إصلاح الملف بالتفصيل ليكون مطابقاً"
    }
  ],
  "topFixes": [
    {
      "itemId": "رقم البند",
      "name": "اسم البند اللغوي",
      "priority": "MUST_HAVE | SHOULD_HAVE | NICE_TO_HAVE",
      "recommendation": "الإصلاح المطلوب ومجراه"
    }
  ],
  "entities": [
    { "id": "ENT-001", "name": "اسم الكيان", "type": "النوع مثل policy / organization / role / concept", "description": "وصف مبسط" }
  ],
  "relations": [
    { "source": "ENT-001", "relation": "نوع الصلة بالعربية مثل تطبق_على", "target": "ENT-002" }
  ]
}`;

    const response = await aiInstance.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const resStr = response.text || '{}';
    geminiReport = safeJsonParse(resStr);

  } catch (err: any) {
    console.error('Gemini Audit Failed or Skipped:', err.message);
    // Silent fallback to programmatic-only or simple guide
  }

  // Combine programmatic results and Gemini results
  const unifiedItems: any[] = [];
  
  clientChecklist.forEach((item: any) => {
    let finalStatus = item.status || 'NOT_APPLICABLE';
    let reasoning = 'بند دلالي، يرجى تفعيل مفتاح الذكاء الاصطناعي (Gemini) لإجراء فحص متقدم للشخصية والمعاني.';
    let recommendation = 'لتفعيل هذا الفحص، اضف مفتاح GEMINI_API_KEY الصالح.';

    // Check if we have a programmatic audit for this item
    if (progResults.statusObject[item.id]) {
      const prog = progResults.statusObject[item.id];
      finalStatus = prog.status;
      reasoning = prog.reasoning || "";
      recommendation = prog.recommendation || "";
    } 
    // Check if we have a Gemini audit for this item
    else if (useAI && geminiReport && geminiReport.semanticScores) {
      const gItem = geminiReport.semanticScores.find((s: any) => s.id === item.id);
      if (gItem) {
        finalStatus = gItem.status;
        reasoning = gItem.reasoning;
        recommendation = gItem.recommendation;
      }
    }

    // Set fallback if the file format doesn't apply to specific items
    if (fileExt !== 'md') {
      // Non Markdown files might get NOT_APPLICABLE for heading/TOC items
      const isMdOnlyItem = ["1.3.1", "2.1.1", "2.1.2", "2.1.3", "2.1.4", "2.2.3", "2.3.2", "4.3.1", "5.2.1", "9.5.1"].includes(item.id);
      if (isMdOnlyItem) {
        finalStatus = 'NOT_APPLICABLE';
        reasoning = 'هذا البند خاص بهيكل ملفات Markdown ولا ينطبق على طبيعة الملف الرقمية الحالية.';
        recommendation = 'لا يتطلب هذا التنسيق في ملفات الـ JSON/JSONL/TXT.';
      }
    }

    unifiedItems.push({
      ...item,
      status: finalStatus,
      reasoning,
      recommendation
    });
  });

  // Calculate compliance score
  // Compliance score = (passed / total applicable) * 100
  const applicableItems = unifiedItems.filter(item => item.status !== 'NOT_APPLICABLE');
  const passedItems = applicableItems.filter(item => item.status === 'PASS');
  const partialItems = applicableItems.filter(item => item.status === 'PARTIAL');
  
  // Passed gets 1 point, partial gets 0.5 points
  const totalScoreVal = passedItems.length + (partialItems.length * 0.5);
  const complianceScore = applicableItems.length > 0 
    ? Math.round((totalScoreVal / applicableItems.length) * 100) 
    : 0;

  // Compile top fixes (merging programmatic fixes and Gemini fixes)
  const combinedFixes: any[] = [];
  
  // Add critical programmatic fixes
  progResults.topFixes.forEach(pf => {
    // get actual Arabic name
    const found = clientChecklist.find((c: any) => c.id === pf.itemId);
    combinedFixes.push({
      ...pf,
      name: found ? found.name : `البند ${pf.itemId}`
    });
  });

  // Add Gemini critical fixes if any
  if (geminiReport && geminiReport.topFixes) {
    geminiReport.topFixes.forEach((gf: any) => {
      if (!combinedFixes.some(f => f.itemId === gf.itemId)) {
        combinedFixes.push({
          itemId: gf.itemId,
          chapterId: Math.floor(parseFloat(gf.itemId)),
          name: gf.name || gf.itemId,
          priority: gf.priority || 'MUST_HAVE',
          recommendation: gf.recommendation || ''
        });
      }
    });
  }

  // Generate cleaned fixed content (OCR corrections, emoji deletion, eastern numerals translation, template injection)
  const cleanedContent = getCleanedAndFixedContent(fileName, content);

  // Generate standard boilerplate template for copy
  const boilerplate = `---
title: "سياسة السفر والإقامة المعتمدة"
doc_id: "HR-POL-105"
version: "2.1"
last_updated: "${new Date().toISOString().split('T')[0]}"
owner: "إدارة هندسة المعرفة"
tags: [سفر, بدلات, إقامة, سياسات]
audience: [جميع_الموظفين]
type: سياسة
summary: "تحدد هذه السياسة الإجراءات والحدود المالية لسفر الموظفين في مهام رسمية."
output_format: "نقاط محددة"
security_level: داخلي
review_cycle: "سنوي"
language: "ar"
chunk_size: 512
overlap_ratio: 0.1
---

# عنوان المستند الرئيسي

## 1. هدف الوثيقة ونطاقها
توضح السياسة الحدود والائتمان المسموح للموظفين..

## سجل التغييرات
| التاريخ | الإصدار | وصف التغيير | المسؤول |
| :--- | :--- | :--- | :--- |
| 2026-06-08 | 1.0 | الإنشاء الأولي للملف | إدارة هندسة المعرفة |
`;

  const report: any = {
    fileName,
    fileSize: size,
    fileType: fileExt as any,
    fileGroup: progResults.fileGroup,
    fileGroupEn: progResults.fileGroupEn,
    complianceScore,
    date: new Date().toISOString().split('T')[0],
    summary: {
      passed: passedItems.length,
      failed: applicableItems.filter(i => i.status === 'FAIL').length,
      partial: partialItems.length,
      notApplicable: unifiedItems.filter(i => i.status === 'NOT_APPLICABLE').length,
      totalApplied: applicableItems.length
    },
    items: unifiedItems,
    topFixes: combinedFixes.slice(0, 5), // Keep top 5 prioritizing MUST_HAVE
    cleanedContent,
    yamlBoilerplate: boilerplate,
    entities: geminiReport?.entities || [],
    relations: geminiReport?.relations || [],
    aiActivated: useAI
  };

  res.json(report);
});

// Endpoint to fetch content from an external public URL
app.post('/api/fetch-url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const fetchResponse = await fetch(url);
    if (!fetchResponse.ok) {
      return res.status(fetchResponse.status).json({ error: `Failed to fetch URL: ${fetchResponse.statusText}` });
    }

    const content = await fetchResponse.text();
    let fileName = url.split('/').pop() || 'imported_file.md';
    if (!fileName.includes('.')) fileName += '.md';
    
    res.json({
      fileName,
      content
    });
  } catch (error: any) {
    console.error('Error fetching URL:', error);
    res.status(500).json({ error: 'Failed to fetch the URL content' });
  }
});

const scheduledJobs: Record<string, any> = {};

app.post('/api/compliance/schedule-report', async (req, res) => {
  const { accessToken, emailTo, subject, reportContent, scheduleString, jobId } = req.body;
  if (!accessToken || !emailTo || !subject || !reportContent || !scheduleString || !jobId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (scheduledJobs[jobId]) {
    scheduledJobs[jobId].stop();
  }

  try {
    const task = cron.schedule(scheduleString, async () => {
      try {
        console.log(`Executing scheduled report to ${emailTo}`);
        const oAuth2Client = new google.auth.OAuth2();
        oAuth2Client.setCredentials({ access_token: accessToken });
        const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const messageParts = [
          `To: ${emailTo}`,
          'Content-Type: text/html; charset=utf-8',
          'MIME-Version: 1.0',
          `Subject: ${utf8Subject}`,
          '',
          reportContent,
        ];
        const message = messageParts.join('\\r\\n');
        
        const encodedMessage = Buffer.from(message)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
          
        await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage,
          },
        });
        console.log('Scheduled report email sent successfully.');
      } catch (err: any) {
        console.error('Error in scheduled task:', err.message);
      }
    });

    scheduledJobs[jobId] = task;
    res.json({ success: true, message: 'Report scheduled successfully' });
  } catch (error: any) {
    console.error('Failed to schedule report:', error);
    res.status(500).json({ error: 'Failed to schedule report: ' + error.message });
  }
});

app.post('/api/compliance/send-report', async (req, res) => {
  const { accessToken, emailTo, subject, reportContent } = req.body;
  
  if (!accessToken || !emailTo || !subject || !reportContent) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const oAuth2Client = new google.auth.OAuth2();
    oAuth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `To: ${emailTo}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      reportContent,
    ];
    const message = messageParts.join('\\r\\n');
    
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
      
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    res.json({ success: true, message: 'Report sent successfully' });
  } catch (error: any) {
    console.error('Failed to send report:', error);
    res.status(500).json({ error: 'Failed to send report: ' + error.message });
  }
});

// Serve frontend assets in production and Vite middleware in dev
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
