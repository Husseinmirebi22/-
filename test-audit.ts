const r = await fetch('http://localhost:3000/api/audit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fileName: 'test.md', content: 'hello', size: 5, checklistItems: [] })
});
console.log(r.status);
