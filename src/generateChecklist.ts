import fs from "fs";

function generateChecklist() {
  const protocolContent = fs.readFileSync("src/protocol_v2.1.json", "utf-8");
  const protocol = JSON.parse(protocolContent);

  const standards = protocol.standards || [];
  const multimedia = protocol.multimedia_standards || [];
  const graph = protocol.graph_rag_standards || [];
  const security = protocol.security_standards || [];
  const kpisItems = Object.values(protocol.kpi_matrix || {}).flat() as any[];
  const drift = protocol.persona_drift_standards || [];

  const chapters: any[] = [
    {
      id: 1,
      title: "الباب الأول: الهوية والبيانات الوصفية والصيغة والتسمية",
      description: "ضمان أن الملف يحمل بطاقة تعريف واضحة، وصيغة مناسبة، وهوية فريدة (YAML Front Matter).",
      categories: ["صيغة الملف والتسمية والترميز", "التعرف على الملف وتصنيفه (باب 0)"]
    },
    {
      id: 2,
      title: "الباب الثاني: الهيكل والتنظيم الداخلي",
      description: "ضمان تنظيم الملف هرمياً، واحتوائه على روابط وتنسيق منظم مهيأ للتقطيع الذكي.",
      categories: ["التنظيف العميق من الضجيج", "الهيكل الهرمي والعناوين", "التقسيم والفواصل والتحقق النهائي"]
    },
    {
      id: 3,
      title: "الباب الثالث: جودة المحتوى المعرفي",
      description: "التأكد من دقة المادة وعمقها، وخلوها من الكليشيهات اللغوية، وملاءمتها للمستمع الذكي.",
      categories: ["النصوص والفقرات"]
    },
    {
      id: 4,
      title: "الباب الرابع: الاتساق الاصطلاحي والمرجعي",
      description: "ضمان استخدام موحد للمصطلحات وروابط واضحة بين الملفات وسلسلة سجل التغييرات.",
      categories: ["التعليمات المدمجة والفهارس الاصطناعية"]
    },
    {
      id: 5,
      title: "الباب الخامس: الامتثال التقني والتقطيع (Chunking)",
      description: "ضمان تهيئة الملف لأداء استرجاعي مثالي من حيث الحجم وبقعية الأفكار.",
      categories: ["معايير التقطيع الأمثل"]
    },
    {
      id: 6,
      title: "الباب السادس: معايير Graph RAG والكيانات",
      description: "بناء رسوم بيانية معرفية للكيانات والعلاقات لتعزيز تماسك الاسترجاع الهجين.",
      categories: ["graph_rag_standards"]
    },
    {
      id: 7,
      title: "الباب السابع: الأمن والسلامة",
      description: "حماية النظام من ثغرات حقن التعليمات، وتسميم البيانات، وتجاوز الصلاحيات وتطهير البيانات الحساسة.",
      categories: ["security_standards"]
    },
    {
      id: 8,
      title: "الباب الثامن: التقييم ومؤشرات الأداء",
      description: "قياس متانة قاعدة المعرفة واستقرار الهوية ومستويات استدعاء وتضمين البيانات.",
      categories: ["kpi_matrix", "persona_drift_standards"]
    },
    {
      id: 9,
      title: "الباب التاسع: خصوصية أنواع الملفات",
      description: "القواعد الخاصة بكل نوع من الملفات (سردية، إجرائية، بيانية، وسائط متعددة).",
      categories: ["multimedia_standards"]
    },
    {
      id: 10,
      title: "الباب العاشر: إجراءات ما قبل الرفع",
      description: "الفحص التام والتدقيق الصياغي النهائي قبل صهر الملف في محرك الاسترجاع.",
      categories: ["post_processing"]
    }
  ];

  let items: any[] = [];

  function getPriority(enforcement: string) {
    if (enforcement?.includes("strict")) return "MUST_HAVE";
    if (enforcement?.includes("recommended") || enforcement?.includes("flexible")) return "SHOULD_HAVE";
    return "NICE_TO_HAVE";
  }

  function getChapter(standard: any, type: string) {
    if (type === "standard") {
        const cat = standard.category || "";
        if (cat.includes("صيغة الملف") || cat.includes("التعرف على الملف") || standard.standard_id.startsWith("G-01") || standard.standard_id.startsWith("G-02") || standard.standard_id.startsWith("G-03")) return 1;
        if (cat.includes("التنظيف العميق") || standard.standard_id.startsWith("G-04") || standard.standard_id.startsWith("G-05") || standard.standard_id.startsWith("G-06") || standard.standard_id.startsWith("G-07") || standard.standard_id.startsWith("G-08") || standard.standard_id.startsWith("G-09") || standard.standard_id.startsWith("G-10") || standard.standard_id.startsWith("G-11") || standard.standard_id.startsWith("G-12")) return 2;
        if (cat.includes("الهيكل الهرمي") || standard.standard_id.startsWith("G-13") || standard.standard_id.startsWith("G-14") || standard.standard_id.startsWith("G-15") || standard.standard_id.startsWith("G-16")) return 2;
        if (cat.includes("النصوص والفقرات") || standard.standard_id.match(/^G-2[2-7]/)) return 3;
        if (cat.includes("التعليمات المدمجة") || standard.standard_id.startsWith("G-28") || standard.standard_id.startsWith("G-29") || standard.standard_id.startsWith("G-30") || standard.standard_id.match(/^G-3[4-5]/)) return 4;
        if (cat.includes("الفواصل والتحقق النهائي") || standard.standard_id.startsWith("G-38") || standard.standard_id.startsWith("G-39") || standard.standard_id.match(/^G-4[0-2]/)) return 10;
        if (cat.includes("معايير التقطيع") || standard.standard_id.match(/^G-4[3-7]/)) return 5;
        if (standard.standard_id.match(/^G-4[8-9]/) || standard.standard_id.match(/^G-5/)) return 1;
        return 1;
    }
    if (type === "multimedia") return 9;
    if (type === "graph") return 6;
    if (type === "security") return 7;
    if (type === "kpi" || type === "drift") return 8;
    return 1;
  }

  function enrichCriteria(s: any, baseCriteria: string, type: string) {
    let criteria = baseCriteria;
    if (s.enforcement) {
        const arEnforce = s.enforcement.includes('strict') ? 'صارم' : s.enforcement.includes('recommended') ? 'موصى به' : 'مرن';
        criteria += `\n- صرامة التطبيق: ${arEnforce}`;
    }
    if (s.scoring_method) {
        const arScore = s.scoring_method === 'binary' ? 'ثنائي (اجتياز/فشل)' : 'متدرج (مستمر)';
        criteria += `\n- التقييم: ${arScore}`;
    }
    if (s.automation_level) {
        const arAuto = s.automation_level === 'fully_automatable' ? 'آلي بالكامل' : s.automation_level === 'partially_automatable' ? 'شبه آلي' : s.automation_level === 'llm_semantic' ? 'تحليل دلالي (LLM)' : 'بشري';
        criteria += `\n- مستوى الأتمتة: ${arAuto}`;
    }
    return criteria.trim();
  }

  for (const s of standards) {
    items.push({
      id: s.standard_id,
      name: s.name,
      chapter: getChapter(s, "standard"),
      priority: getPriority(s.enforcement),
      description: s.description,
      successCriteria: enrichCriteria(s, s.remediation?.suggestion_text || s.description, "standard"),
      example: s.remediation?.auto_fix_code || "تطبيق المعيار المذكور.",
      status: "NOT_APPLICABLE",
      category: s.category
    });
  }

  for (const s of multimedia) {
     items.push({
      id: s.standard_id,
      name: s.name,
      chapter: getChapter(s, "multimedia"),
      priority: getPriority(s.enforcement),
      description: s.description,
      successCriteria: enrichCriteria(s, s.description, "multimedia"),
      example: s.example || "تطبيق المعيار المذكور.",
      status: "NOT_APPLICABLE",
      category: "Multimedia"
    });
  }

  for (const s of graph) {
     items.push({
      id: s.standard_id,
      name: s.name,
      chapter: getChapter(s, "graph"),
      priority: getPriority(s.enforcement),
      description: s.description,
      successCriteria: enrichCriteria(s, s.description, "graph"),
      example: "تطبيق المعيار المذكور.",
      status: "NOT_APPLICABLE",
      category: "Graph RAG"
    });
  }

  for (const s of security) {
     items.push({
      id: s.standard_id,
      name: s.name,
      chapter: getChapter(s, "security"),
      priority: getPriority(s.enforcement),
      description: s.description,
      successCriteria: enrichCriteria(s, s.description, "security"),
      example: s.template || "تطبيق المعيار المذكور.",
      status: "NOT_APPLICABLE",
      category: "Security"
    });
  }

  for (const s of kpisItems) {
     if (!s.kpi_id) continue;
     items.push({
      id: s.kpi_id,
      name: s.name,
      chapter: getChapter(s, "kpi"),
      priority: "MUST_HAVE",
      description: s.definition,
      successCriteria: `Target: ${s.target}`,
      example: s.target,
      status: "NOT_APPLICABLE",
      category: "KPIs"
    });
  }

  for (const s of drift) {
     items.push({
      id: s.standard_id,
      name: s.name,
      chapter: getChapter(s, "drift"),
      priority: getPriority(s.enforcement),
      description: s.description,
      successCriteria: enrichCriteria(s, s.description, "drift"),
      example: "تطبيق المعيار المذكور.",
      status: "NOT_APPLICABLE",
      category: "Persona Drift"
    });
  }

  const output = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChecklistChapter, AuditItem } from './types';

export const CHECKLIST_CHAPTERS: ChecklistChapter[] = ${JSON.stringify(chapters, null, 2)};

export const DEFAULT_CHECKLIST_ITEMS: AuditItem[] = ${JSON.stringify(items, null, 2)};
`;

  fs.writeFileSync("src/checklistData.ts", output);
  console.log("Checklist generated! Total items: " + items.length);
}

generateChecklist();
