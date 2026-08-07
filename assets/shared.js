(function () {
  "use strict";

  const LEGACY_STORAGE_KEY = "MSDS-planner-selections-v1";
  const STORAGE_KEY = "CITYU-planner-selections-v3";
  const PROGRAMME_KEY = "CITYU-current-programme";
  const DEFAULT_PROGRAMME = "MSDS";
  const DAY_NAMES = { M: "周一", T: "周二", W: "周三", R: "周四", F: "周五", S: "周六", U: "周日" };
  let courseDataPromise;

  // 评价等级 → 星级口碑分（0-5，未知为 null）
  const LEVEL_RATINGS = {
    strong: 5,
    recommended: 4.5,
    good: 4.5,
    research: 4,
    neutral: 3.5,
    caution: 2.5,
    unknown: null
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadCourseData() {
    if (!courseDataPromise) {
      const getJson = (url) => fetch(url).then((response) => {
        if (!response.ok) throw new Error(`数据读取失败：${url}`);
        return response.json();
      });
      courseDataPromise = Promise.all([
        getJson("data/courses/index.json"),
        getJson("data/sources.json")
      ]).then(([index, sources]) => Promise.all([
        Promise.all(index.courses.map((course) => Promise.all([
          getJson(`data/sections/${encodeURIComponent(course.code)}.json`),
          getJson(`data/reviews/${encodeURIComponent(course.code)}.json`)
        ]).then(([eligibleSections, recommendation]) => ({
          ...course,
          eligible_sections: eligibleSections,
          recommendation
        })))),
        Promise.all(Object.keys(sources).map((sourceId) =>
          getJson(`data/source-reviews/${encodeURIComponent(sourceId)}.json`)
            .then((sourceReview) => [sourceId, sourceReview])
        ))
      ]).then(([courses, sourceReviewEntries]) => ({
        ...index,
        sources,
        sourceReviews: Object.fromEntries(sourceReviewEntries),
        courses
      })));
    }
    return courseDataPromise;
  }

  function getRecommendation(course) {
    return course?.recommendation || {
      level: "unknown",
      verdict: "暂无评价",
      summary: "本地资料没有足够信息，暂不作判断。",
      tags: [],
      source_ids: [],
      sourceIds: []
    };
  }

  function getProgrammes(data) {
    return Array.isArray(data?.programmes) ? data.programmes : [];
  }

  function getProgramme(data, code) {
    const programmes = getProgrammes(data);
    const target = String(code || DEFAULT_PROGRAMME);
    return programmes.find((item) => item.code === target)
      || programmes.find((item) => item.code === DEFAULT_PROGRAMME)
      || { code: DEFAULT_PROGRAMME, name_en: "MSc Data Science", name_zh: "数据科学理学硕士" };
  }

  // 课程在某个项目下的必修/选修类型；未单独指定时回退到课程的 requirement_type
  function getRequirementType(course, programmeCode) {
    const code = String(programmeCode || DEFAULT_PROGRAMME);
    return course?.programme_requirement_types?.[code] || course?.requirement_type || "elective";
  }

  // 课程在某个项目下所属的选修分组（如 Group I / Group II）；无分组要求时返回 null
  function getElectiveGroup(course, programmeCode) {
    const code = String(programmeCode || DEFAULT_PROGRAMME);
    return course?.programme_elective_groups?.[code] || null;
  }

  // 根据项目的 requirement_credit_units.elective_groups 配置查找分组的展示信息
  function getElectiveGroupInfo(programme, groupKey) {
    const groups = programme?.requirement_credit_units?.elective_groups;
    if (!Array.isArray(groups)) return null;
    return groups.find((group) => group.key === groupKey) || null;
  }

  // 课程所属的项目列表；未标注时回退到默认项目
  function courseProgrammes(course, data) {
    if (Array.isArray(course?.programmes) && course.programmes.length) return course.programmes;
    return [data?.programme || DEFAULT_PROGRAMME];
  }

  function getStoredProgramme() {
    try {
      return localStorage.getItem(PROGRAMME_KEY) || DEFAULT_PROGRAMME;
    } catch {
      return DEFAULT_PROGRAMME;
    }
  }

  function saveProgramme(code) {
    try {
      localStorage.setItem(PROGRAMME_KEY, String(code || DEFAULT_PROGRAMME));
    } catch {
      /* ignore */
    }
  }

  function getAllSelections() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function migrateLegacySelections() {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "{}");
      if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) return;
      const all = getAllSelections();
      if (!all[DEFAULT_PROGRAMME]) {
        all[DEFAULT_PROGRAMME] = legacy;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      }
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  function getStoredSelections(programmeCode) {
    migrateLegacySelections();
    const all = getAllSelections();
    const code = String(programmeCode || getStoredProgramme());
    const selections = all[code];
    return selections && typeof selections === "object" && !Array.isArray(selections) ? selections : {};
  }

  function saveSelections(selections, programmeCode) {
    const all = getAllSelections();
    const code = String(programmeCode || getStoredProgramme());
    all[code] = selections || {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  function clearSelections(programmeCode) {
    const all = getAllSelections();
    const code = String(programmeCode || getStoredProgramme());
    delete all[code];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  function sectionKey(section) {
    return String(section.crn || `${section.section}-${section.day}-${section.time}`);
  }

  // 同一 CRN 可能对应多条“每周上课时间”记录（如一周两次课）；
  // 凡是需要枚举“可选班次”本身（而非某班次的每次上课时间）的地方，都应先按 CRN 去重
  function uniqueByKey(sections) {
    const seen = new Set();
    return sections.filter((section) => {
      const key = sectionKey(section);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function pickTutorial(primary, tutorials) {
    if (!tutorials.length) return null;
    const suffix = primary?.section?.match(/(\d+)$/)?.[1];
    if (suffix) {
      const exact = tutorials.find((item) => item.section.endsWith(suffix));
      if (exact) return exact;
      const family = tutorials.find((item) => item.section.slice(1, 2) === primary.section.slice(1, 2));
      if (family) return family;
    }
    return tutorials[0];
  }

  function makeDefaultSelection(course) {
    const primaries = uniqueByKey(course.eligible_sections.filter((section) => Number(section.credits) > 0));
    const tutorials = uniqueByKey(course.eligible_sections.filter((section) => Number(section.credits) === 0));
    const primary = primaries[0] || course.eligible_sections[0];
    const tutorial = pickTutorial(primary, tutorials);
    return {
      primaryCrn: primary ? sectionKey(primary) : null,
      tutorialCrn: tutorial ? sectionKey(tutorial) : null
    };
  }

  function findSection(course, key) {
    return course.eligible_sections.find((section) => sectionKey(section) === String(key));
  }

  function formatSection(section) {
    if (!section) return "";
    return `${section.section} · ${DAY_NAMES[section.day] || section.day} ${section.time}`;
  }

  // 从 notes 中提取“only for Programme: X”限制，返回专业名称列表（无限制则为空数组）
  function sectionRestrictedProgrammes(section) {
    if (!Array.isArray(section?.notes)) return [];
    return section.notes
      .map((note) => note.match(/^only for Programme:\s*(.+)$/i)?.[1]?.trim())
      .filter(Boolean);
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function recommendationBadge(rec, small = false) {
    const className = small ? "mini-badge" : "verdict-badge";
    return `<span class="${className} ${escapeHtml(rec.level)}">${escapeHtml(rec.verdict)}</span>`;
  }

  // 由评价等级推导口碑分；未知返回 null
  function ratingFor(rec) {
    const level = rec?.level || "unknown";
    const score = LEVEL_RATINGS[level];
    return score == null ? null : score;
  }

  // 渲染星级口碑分（含分数与来源数）
  function ratingStars(rec, options = {}) {
    const score = ratingFor(rec);
    if (score == null) return "";
    const full = Math.floor(score);
    const half = score - full >= 0.25 && score - full < 0.75;
    const empty = 5 - full - (half ? 1 : 0);
    const stars =
      "★".repeat(full) + (half ? "⯨" : "") + "☆".repeat(empty);
    const count = rec?.source_ids?.length || rec?.sourceIds?.length || 0;
    const meta = options.withMeta === false ? "" : `<span class="rating-meta">${count ? `${count} 条评价来源` : "学生评价"}</span>`;
    return `<span class="rating-line" aria-label="口碑评分 ${score} 分（满分 5 分）"><span class="rating-stars" aria-hidden="true">${stars}</span><strong class="rating-score">${score.toFixed(1)}</strong>${meta}</span>`;
  }

  // ==================== 语言切换 ====================
  const LANG_KEY = "CITYU-lang";

  function getStoredLang() {
    try {
      return localStorage.getItem(LANG_KEY) || "zh";
    } catch {
      return "zh";
    }
  }

  function saveLang(lang) {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
  }

  const I18N = {
    zh: {
      "nav.courses": "课程表",
      "nav.cityu": "城大官网",
      "intro.eyebrow": "我的课表",
      "intro.title": "自助排课台",
      "intro.desc": "先选择学院，再选择院系与硕士项目，即可按对应培养方案浏览课程、比较班次并规划每周课表；左侧悬停可预览课程评价与时段。",
      "stat.graduation": "毕业学分",
      "stat.requirement": "核心 + 选修",
      "prog.label": "硕士项目",
      "college.label": "学院",
      "department.label": "院系",
      "tab.browse": "浏览课程",
      "tab.selected": "已选",
      "search.placeholder": "搜索课号或课程名",
      "filter.all": "全部",
      "filter.core": "核心",
      "filter.elective": "选修",
      "day.label": "上课日",
      "day.all": "全部",
      "toolbar.clear": "清空",
      "toolbar.export": "导出文本",
      "toolbar.import": "导入文本",
      "conflict.clear": "暂无冲突",
      "empty.timetable.title": "从左侧加入课程",
      "empty.timetable.desc": "班次可在「已选」中切换",
      "course.detail.title": "课程详情",
      "syllabus.title": "详细课程介绍",
      "nav.about": "关于我们",
      "about.subtitle": "CityUHK CSSA · 关于我们",
      "about.intro.title": "组织简介",
      "about.intro": "香港城市大学中国学生学者联合会（CityUHK CSSA）是官方认证、非政治、非盈利的学生组织，致力于服务全体城大学生与学者。我们提供免费的学业支持、职业发展、反诈宣传及 40+ 兴趣社团，并定期举办名企参访、粤语课堂、春节嘉年华等丰富活动。",
      "about.dept.title": "五大常设部门",
      "about.dept.desc": "为同学们提供多元化的锻炼平台：",
      "about.join.title": "加入我们",
      "about.cta": "无论你是希望提升组织协调能力、积累职场资源，还是单纯想结识志同道合的伙伴，CSSA 都是你不容错过的成长舞台。欢迎加入我们的大家庭，在金秋校园与我们相遇，一起书写属于你的城大篇章！",
      "about.follow.title": "关注我们",
      "about.follow": "更多精彩内容，欢迎关注 CSSA 官方社交媒体账号，获取最新活动资讯与福利信息！",
      "nav.feedback": "问题反馈",
      "feedback.hero.title": "问题反馈",
      "feedback.hero.line1": "发现 Bug、课程数据有误或有任何建议？",
      "feedback.hero.line2": "留下你的信息与问题描述，我们会尽快跟进处理。",
      "feedback.section.info": "你的信息",
      "feedback.label.name": "姓名",
      "feedback.label.programme": "专业",
      "feedback.placeholder.name": "请输入你的姓名或昵称",
      "feedback.placeholder.programme": "例如：数据科学硕士 / MSc Data Science",
      "feedback.section.description": "问题描述",
      "feedback.label.description": "请描述你遇到的问题或建议",
      "feedback.placeholder.description": "请详细描述问题现象、出现的页面和操作步骤，或写下你的建议…",
      "feedback.btn.reset": "重置",
      "feedback.btn.submit": "提交反馈",
      "feedback.result.title": "反馈已生成",
      "feedback.result.desc": "请复制以下内容，发送给管理员或提交到 GitHub Issues：",
      "feedback.result.copy": "复制内容",
      "feedback.result.github": "提交到 GitHub",
      "feedback.result.close": "关闭"
    },
    en: {
      "nav.courses": "Courses",
      "nav.cityu": "CityU",
      "intro.eyebrow": "My Timetable",
      "intro.title": "Course Planner",
      "intro.desc": "Pick a college, then a department and a master's programme to browse courses, compare sections, and plan your weekly schedule. Hover on the left panel to preview course reviews and time slots.",
      "stat.graduation": "Graduation Credits",
      "stat.requirement": "Core + Elective",
      "prog.label": "Programme",
      "college.label": "College",
      "department.label": "Department",
      "tab.browse": "Browse",
      "tab.selected": "Selected",
      "search.placeholder": "Search course code or name",
      "filter.all": "All",
      "filter.core": "Core",
      "filter.elective": "Elective",
      "day.label": "Day",
      "day.all": "All",
      "toolbar.clear": "Clear",
      "toolbar.export": "Export",
      "toolbar.import": "Import",
      "conflict.clear": "No conflicts",
      "empty.timetable.title": "Add courses from the left",
      "empty.timetable.desc": "Switch sections in \"Selected\" tab",
      "course.detail.title": "Course Detail",
      "syllabus.title": "Course Syllabus",
      "nav.about": "About Us",
      "about.subtitle": "CityUHK CSSA · About Us",
      "about.intro.title": "About the Organisation",
      "about.intro": "The Chinese Students and Scholars Association at City University of Hong Kong (CityUHK CSSA) is an officially recognised, non-political, non-profit student organisation dedicated to serving all CityU students and scholars. We offer free academic support, career development, anti-fraud outreach, and 40+ interest clubs, and regularly host company visits, Cantonese classes, Spring Festival carnival, and more.",
      "about.dept.title": "Five Standing Departments",
      "about.dept.desc": "Providing diverse platforms for students to grow:",
      "about.join.title": "Join Us",
      "about.cta": "Whether you want to sharpen your organisational skills, build professional networks, or simply meet like-minded friends, CSSA is a stage you cannot miss. Join our family, meet us on campus this autumn, and write your own CityU chapter together!",
      "about.follow.title": "Follow Us",
      "about.follow": "Follow CSSA's official social media for the latest events and perks!",
      "nav.feedback": "Feedback",
      "feedback.hero.title": "Feedback",
      "feedback.hero.line1": "Found a bug, incorrect course data, or have a suggestion?",
      "feedback.hero.line2": "Leave your info and describe the issue — we'll follow up soon.",
      "feedback.section.info": "Your Info",
      "feedback.label.name": "Name",
      "feedback.label.programme": "Programme",
      "feedback.placeholder.name": "Enter your name or nickname",
      "feedback.placeholder.programme": "e.g. MSc Data Science",
      "feedback.section.description": "Issue Description",
      "feedback.label.description": "Describe the issue or suggestion",
      "feedback.placeholder.description": "Please describe the issue, the page it occurred on, and the steps to reproduce, or share your suggestion…",
      "feedback.btn.reset": "Reset",
      "feedback.btn.submit": "Submit Feedback",
      "feedback.result.title": "Feedback Generated",
      "feedback.result.desc": "Please copy the content below and send it to the admin or submit it to GitHub Issues:",
      "feedback.result.copy": "Copy Content",
      "feedback.result.github": "Submit to GitHub",
      "feedback.result.close": "Close"
    }
  };

  function t(key) {
    const lang = getStoredLang();
    return (I18N[lang] && I18N[lang][key]) || (I18N.zh[key] || key);
  }

  function applyLang() {
    const lang = getStoredLang();
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";

    // 更新语言按钮标签
    const langLabel = document.getElementById("lang-label");
    if (langLabel) {
      langLabel.textContent = lang === "zh" ? "EN" : "中文";
    }

    // 更新带 data-i18n 的元素
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const text = t(key);
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.placeholder = text;
      } else {
        el.textContent = text;
      }
    });
  }

  function initLangToggle() {
    const toggle = document.getElementById("lang-toggle");
    if (!toggle) return;

    toggle.addEventListener("click", () => {
      const current = getStoredLang();
      const next = current === "zh" ? "en" : "zh";
      saveLang(next);
      applyLang();
      showToast(next === "zh" ? "已切换为中文" : "Switched to English");
    });

    applyLang();
  }

  // ==================== 关于我们弹窗（已改为独立页面，保留兼容） ====================
  function initAboutToggle() {
    // 关于我们已迁移到 about.html 独立页面，此处保留空函数以兼容旧引用
  }

  function initShared() {
    initLangToggle();
    initAboutToggle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initShared);
  } else {
    initShared();
  }

  window.MSDS = {
    DAY_NAMES,
    DEFAULT_PROGRAMME,
    STORAGE_KEY,
    PROGRAMME_KEY,
    clearSelections,
    courseProgrammes,
    escapeHtml,
    findSection,
    formatSection,
    sectionRestrictedProgrammes,
    getElectiveGroup,
    getElectiveGroupInfo,
    getProgramme,
    getProgrammes,
    getRecommendation,
    getRequirementType,
    getStoredProgramme,
    getStoredSelections,
    loadCourseData,
    makeDefaultSelection,
    pickTutorial,
    uniqueByKey,
    ratingFor,
    ratingStars,
    recommendationBadge,
    saveProgramme,
    saveSelections,
    sectionKey,
    showToast,
    getStoredLang,
    saveLang,
    t,
    applyLang
  };
})();
