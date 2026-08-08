(function () {
  "use strict";

  const DAYS = ["M", "T", "W", "R", "F", "S"];
  const START_HOUR = 9;
  const END_HOUR = 22;
  const COLORS = [
    ["#dceee6", "#145f49", "#0e4938"],
    ["#e1ecf4", "#275b83", "#204c6c"],
    ["#f8e9d7", "#a45b16", "#81440d"],
    ["#ebe6f3", "#65508d", "#514071"],
    ["#edf0d9", "#6d7b25", "#526018"],
    ["#f2e4e8", "#984a63", "#77364c"]
  ];

  let data = null;
  let courses = [];
  let programmes = [];
  let activeProgramme = MSDS.getStoredProgramme() || MSDS.DEFAULT_PROGRAMME;
  let activeCollege = "";
  let activeDepartment = "";
  let selections = {};
  let searchTerm = "";
  let activeFilter = "all";
  let activeDay = "all";
  let activeSemester = "all";

  const listElement = document.getElementById("course-list");
  const selectedListElement = document.getElementById("selected-list");

  function currentProgramme() {
    return MSDS.getProgramme(data, activeProgramme);
  }

  // 当前项目可选的课程（未标注归属的课程默认归入默认项目）
  function programmeCourses() {
    return courses.filter((course) => MSDS.courseProgrammes(course, data).includes(activeProgramme));
  }

  function requirementTypeOf(course) {
    return MSDS.getRequirementType(course, activeProgramme);
  }

  function courseByCode(code) {
    return courses.find((course) => course.code === code);
  }

  function reloadSelections() {
    selections = MSDS.getStoredSelections(activeProgramme);
  }

  function filterCourses() {
    return programmeCourses().filter((course) => {
      const haystack = `${course.code} ${course.programme_title}`.toLowerCase();
      const matchesSearch = haystack.includes(searchTerm.toLowerCase());
      const matchesFilter = activeFilter === "all"
        || (activeFilter === "core" || activeFilter === "elective"
          ? requirementTypeOf(course) === activeFilter
          : MSDS.getElectiveGroup(course, activeProgramme) === activeFilter);
      const primaryDays = course.eligible_sections
        .filter((section) => Number(section.credits) > 0)
        .map((section) => section.day);
      const matchesDay = activeDay === "all" || primaryDays.includes(activeDay);
      const matchesSemester = activeSemester === "all" || course.semester_tag === activeSemester;
      return matchesSearch && matchesFilter && matchesDay && matchesSemester;
    });
  }

  function renderProgrammePills() {
    // 三级级联：学院 → 系 → 硕士项目；三行始终可见，默认展开当前项目所在的学院与院系
    renderCollegePills();
    renderDepartmentPills();
    renderProgrammeLevelPills();
  }

  // 一级：学院
  function colleges() {
    const seen = new Set();
    const list = [];
    programmes.forEach((p) => {
      const key = p.college_en || "College of Computing";
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ key, name_zh: p.college || "计算学院", name_en: key });
      }
    });
    return list;
  }

  function collegeProgrammes(collegeKey) {
    return programmes.filter((p) => (p.college_en || "College of Computing") === collegeKey);
  }

  function renderCollegePills() {
    const container = document.getElementById("college-pills");
    if (!container) return;
    const list = colleges();
    const row = document.getElementById("college-row");
    if (row) row.hidden = list.length === 0;
    container.innerHTML = list.map((c) => {
      const active = c.key === activeCollege;
      return `<button class="programme-pill college-pill ${active ? "active" : ""}" type="button" role="tab" aria-selected="${active ? "true" : "false"}" data-college="${MSDS.escapeHtml(c.key)}" title="${MSDS.escapeHtml(c.name_zh)}（${MSDS.escapeHtml(c.name_en)}）">${MSDS.escapeHtml(c.name_zh)}<small>${MSDS.escapeHtml(c.name_en)}</small></button>`;
    }).join("");
  }

  // 二级：系
  function departments() {
    const seen = new Set();
    const list = [];
    collegeProgrammes(activeCollege).forEach((p) => {
      const key = p.department_en || p.department || "Department";
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ key, name_zh: p.department || key, name_en: key });
      }
    });
    return list;
  }

  function renderDepartmentPills() {
    const container = document.getElementById("department-pills");
    if (!container) return;
    const list = departments();
    if (!list.some((d) => d.key === activeDepartment)) activeDepartment = list.length ? list[0].key : "";
    const row = document.getElementById("department-row");
    if (row) row.hidden = list.length === 0;
    container.innerHTML = list.map((d) => {
      const active = d.key === activeDepartment;
      return `<button class="programme-pill department-pill ${active ? "active" : ""}" type="button" role="tab" aria-selected="${active ? "true" : "false"}" data-department="${MSDS.escapeHtml(d.key)}" title="${MSDS.escapeHtml(d.name_en)}">${MSDS.escapeHtml(d.name_zh)}<small>${MSDS.escapeHtml(d.name_en.replace(/^Department of /, ""))}</small></button>`;
    }).join("");
  }

  // 三级：硕士项目
  function departmentProgrammes() {
    return collegeProgrammes(activeCollege).filter(
      (p) => (p.department_en || p.department || "Department") === activeDepartment
    );
  }

  function renderProgrammeLevelPills() {
    const container = document.getElementById("programme-pills");
    if (!container) return;
    const list = departmentProgrammes();
    const row = document.getElementById("programme-row");
    if (row) row.hidden = list.length === 0;
    const hints = [];
    container.innerHTML = list.map((programme) => {
      const available = programme.data_ready !== false
        && courses.some((course) => MSDS.courseProgrammes(course, data).includes(programme.code));
      const active = programme.code === activeProgramme;
      const hint = available
        ? `${MSDS.escapeHtml(programme.name_zh)}（${MSDS.escapeHtml(programme.name_en)}）`
        : `${MSDS.escapeHtml(programme.name_zh)}：课程数据待补充`;
      if (active) hints.push(hint);
      if (!available) {
        return `<span class="programme-pill is-pending" role="tab" aria-selected="false" title="课程数据待补充，敬请期待">${MSDS.escapeHtml(programme.code)}<small>筹备中</small></span>`;
      }
      return `<button class="programme-pill ${active ? "active" : ""}" type="button" role="tab" aria-selected="${active ? "true" : "false"}" data-programme="${MSDS.escapeHtml(programme.code)}" title="${hint}">${MSDS.escapeHtml(programme.code)}<small>${MSDS.escapeHtml(programme.name_zh.replace(/硕士$/, ""))}</small></button>`;
    }).join("");
    const hint = document.getElementById("programme-bar-hint");
    if (hint) hint.textContent = hints[0] || "";
  }

  function renderProgrammeStats() {
    const programme = currentProgramme();
    document.getElementById("stat-graduation").textContent = programme.graduation_credit_units
      ? `${programme.graduation_credit_units}`
      : "—";
    document.getElementById("stat-graduation-label").textContent = "毕业学分";
    const requirement = programme.requirement_credit_units;
    if (requirement && requirement.core != null && requirement.electives != null) {
      document.getElementById("stat-requirement").textContent = `${requirement.core} + ${requirement.electives}`;
      document.getElementById("stat-requirement-label").textContent = "核心 + 选修";
    } else {
      document.getElementById("stat-requirement").textContent = "以学院为准";
      document.getElementById("stat-requirement-label").textContent = "核心 + 选修学分";
    }
    document.getElementById("programme-summary-name").textContent = `${programme.code} · ${programme.name_zh}`;
    renderFilterRow(programme);
    renderTermFilter();
    // 课表表头的项目介绍链接
    const infoLink = document.getElementById("programme-info-link");
    if (infoLink) {
      if (programme.programme_url) {
        infoLink.href = programme.programme_url;
        infoLink.hidden = false;
        infoLink.title = `查看 ${programme.name_zh} 官方项目介绍`;
        infoLink.textContent = "项目介绍 ↗";
      } else {
        infoLink.hidden = true;
      }
    }
    document.getElementById("data-note").textContent = `课表快照：${data.schedule_as_of || ""}（Asia/Beijing），数据采集自 CityU AIMS 系统。名额和注册状态会变化，请以 CityU 系统为准。`;
  }

  // 若当前项目配置了选修分组（如 MSCY 的 Group I / Group II），在“选修”后追加对应筛选按钮
  function renderFilterRow(programme) {
    const row = document.querySelector(".filter-row");
    if (!row) return;
    row.querySelectorAll(".filter-pill-group").forEach((el) => el.remove());

    const groups = programme?.requirement_credit_units?.elective_groups;
    if (Array.isArray(groups) && groups.length) {
      const lang = MSDS.getStoredLang();
      let anchor = row.querySelector('[data-filter="elective"]');
      groups.forEach((group) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "filter-pill filter-pill-group";
        button.dataset.filter = group.key;
        button.textContent = lang === "en" ? group.label_en : group.label_zh;
        anchor?.insertAdjacentElement("afterend", button);
        anchor = button;
      });
    }

    const validFilters = ["all", "core", "elective", ...(groups || []).map((group) => group.key)];
    if (!validFilters.includes(activeFilter)) activeFilter = "all";
    row.querySelectorAll(".filter-pill").forEach((item) => item.classList.toggle("active", item.dataset.filter === activeFilter));
  }

  // 若当前项目的课程带有学期标签（如 MSCY 的 SemA/SemB），显示独立的学期筛选行；
  // 该维度与“核心/选修/分组”筛选相互独立，可同时生效（与 activeDay 的模式一致）
  function renderTermFilter() {
    const container = document.getElementById("term-filter");
    const row = document.getElementById("term-filter-row");
    if (!container || !row) return;

    const terms = [...new Set(programmeCourses().map((course) => course.semester_tag).filter(Boolean))].sort();
    if (!terms.length) {
      container.hidden = true;
      row.innerHTML = "";
      activeSemester = "all";
      return;
    }
    container.hidden = false;
    if (!["all", ...terms].includes(activeSemester)) activeSemester = "all";
    row.innerHTML = [`<button class="term-filter-pill ${activeSemester === "all" ? "active" : ""}" type="button" data-term-filter="all">全部</button>`]
      .concat(terms.map((term) => `<button class="term-filter-pill ${activeSemester === term ? "active" : ""}" type="button" data-term-filter="${MSDS.escapeHtml(term)}">${MSDS.escapeHtml(term)}</button>`))
      .join("");
  }

  function renderCourseList() {
    const filtered = filterCourses();
    if (!filtered.length) {
      listElement.innerHTML = '<div class="empty-list">当前项目下没有符合条件的课程</div>';
      return;
    }

    listElement.innerHTML = filtered.map((course) => {
      const rec = MSDS.getRecommendation(course);
      const isAdded = Boolean(selections[course.code]);
      // 原始记录：一个班次可能对应多条“每周上课时间”（如一周两次课），用于课表文案完整展示
      const primaries = course.eligible_sections.filter((item) => Number(item.credits) > 0);
      const tutorials = course.eligible_sections.filter((item) => Number(item.credits) === 0);
      // 去重后的班次列表：用于“共几个班次”计数与“选择时间”下拉框（同一班次的多次上课时间不算多个选项）
      const primaryOptions = MSDS.uniqueByKey(primaries);
      const tutorialOptions = MSDS.uniqueByKey(tutorials);
      const scheduleText = primaries.map((item) => `${MSDS.DAY_NAMES[item.day]} ${item.time}`).join(" / ");
      const selectedPrimary = selections[course.code]?.primaryCrn;
      const selectedTutorial = selections[course.code]?.tutorialCrn
        || (tutorialOptions.length ? MSDS.sectionKey(MSDS.pickTutorial(MSDS.findSection(course, selectedPrimary) || primaryOptions[0], tutorialOptions)) : null);
      const coreBadge = requirementTypeOf(course) === "core"
        ? '<span class="mini-badge core">核心</span>'
        : MSDS.recommendationBadge(rec, true);
      const groupInfo = MSDS.getElectiveGroupInfo(currentProgramme(), MSDS.getElectiveGroup(course, activeProgramme));
      const groupBadge = groupInfo ? `<span class="mini-badge group">${MSDS.escapeHtml(groupInfo.label_zh)}</span>` : "";
      const termBadge = course.semester_tag ? `<span class="mini-badge term">${MSDS.escapeHtml(course.semester_tag)}</span>` : "";
      return `
        <article class="course-row">
          <div class="course-row-main">
            <div class="course-code-line">
              <span class="course-code">${MSDS.escapeHtml(course.code)}</span>
              ${coreBadge}
              ${groupBadge}
              ${termBadge}
            </div>
            <a class="course-title-link" href="course.html?code=${encodeURIComponent(course.code)}">${MSDS.escapeHtml(course.programme_title)}</a>
            <div class="course-meta"><span>${course.credits} 学分</span><span>${primaryOptions.length} 个主课班次</span>${MSDS.ratingStars(rec, { withMeta: false }) ? `<span class="course-rating">${MSDS.ratingStars(rec, { withMeta: false })}</span>` : ""}</div>
            <div class="course-schedule" title="${MSDS.escapeHtml(scheduleText)}">${MSDS.escapeHtml(scheduleText)}</div>
            <div class="course-preview" aria-label="${MSDS.escapeHtml(course.code)} 课程预览">
              <p>${MSDS.escapeHtml(rec.summary)}</p>
              <div class="course-preview-tags">${rec.tags.slice(0, 3).map((tag) => `<span>${MSDS.escapeHtml(tag)}</span>`).join("") || `<span>${MSDS.escapeHtml(rec.verdict)}</span>`}</div>
            </div>
            ${primaryOptions.length > 1 ? `<label class="quick-section-picker"><span>选择时间</span><select data-quick-section="${MSDS.escapeHtml(course.code)}" aria-label="选择 ${MSDS.escapeHtml(course.code)} 上课时间">${sectionOptions(primaryOptions, selectedPrimary || MSDS.sectionKey(primaryOptions[0]))}</select></label>` : ""}
            ${tutorialOptions.length > 1 ? `<label class="quick-section-picker"><span>选择 Tutorial</span><select data-quick-tutorial="${MSDS.escapeHtml(course.code)}" aria-label="选择 ${MSDS.escapeHtml(course.code)} Tutorial">${sectionOptions(tutorialOptions, selectedTutorial)}</select></label>` : ""}
          </div>
          ${(() => {
            // 未开设课程（无任何班次）：加入后显示为可再次点击取消的按钮，避免无法撤销选择
            const isUnopened = course.eligible_sections.length === 0;
            if (!isAdded) {
              return `<button class="add-course" type="button" data-code="${MSDS.escapeHtml(course.code)}" aria-label="加入 ${MSDS.escapeHtml(course.code)}">+</button>`;
            }
            if (isUnopened) {
              return `<button class="add-course is-added is-removable" type="button" data-code="${MSDS.escapeHtml(course.code)}" aria-label="取消选择 ${MSDS.escapeHtml(course.code)}">✓</button>`;
            }
            return `<span class="add-course is-added" aria-label="${MSDS.escapeHtml(course.code)} 已在课表">✓</span>`;
          })()}
        </article>`;
    }).join("");
  }

  function sectionOptions(sections, selectedKey) {
    return sections.map((section) => {
      const key = MSDS.sectionKey(section);
      const webNote = section.web === "N" ? " · 非网页注册" : "";
      const restricted = MSDS.sectionRestrictedProgrammes(section);
      const restrictionNote = restricted.length ? ` · 仅限：${restricted.join("、")}` : "";
      return `<option value="${MSDS.escapeHtml(key)}" ${String(selectedKey) === key ? "selected" : ""}>${MSDS.escapeHtml(MSDS.formatSection(section) + webNote + restrictionNote)}</option>`;
    }).join("");
  }

  function renderSelectedList() {
    const selectedCourses = programmeCourses().filter((course) => selections[course.code]);
    if (!selectedCourses.length) {
      selectedListElement.innerHTML = '<div class="empty-list"><strong>还没有课程</strong><br>回到“浏览课程”开始排课</div>';
      return;
    }

    selectedListElement.innerHTML = selectedCourses.map((course) => {
      const selected = selections[course.code];
      const primaries = MSDS.uniqueByKey(course.eligible_sections.filter((section) => Number(section.credits) > 0));
      const tutorials = MSDS.uniqueByKey(course.eligible_sections.filter((section) => Number(section.credits) === 0));
      return `
        <article class="selected-course">
          <div class="selected-course-head">
            <div><a href="course.html?code=${encodeURIComponent(course.code)}">${MSDS.escapeHtml(course.code)}</a><small>${MSDS.escapeHtml(course.programme_title)}</small></div>
          </div>
          <div class="section-selects">
            <label>主课<select data-code="${MSDS.escapeHtml(course.code)}" data-kind="primary">${sectionOptions(primaries, selected.primaryCrn)}</select></label>
            ${tutorials.length ? `<label>Tutorial<select data-code="${MSDS.escapeHtml(course.code)}" data-kind="tutorial"><option value="">不选择</option>${sectionOptions(tutorials, selected.tutorialCrn)}</select></label>` : ""}
          </div>
        </article>`;
    }).join("");
  }

  function renderSelectedChips() {
    const selectedCourses = programmeCourses().filter((course) => selections[course.code]);
    const container = document.getElementById("selected-chips");
    if (!selectedCourses.length) {
      container.innerHTML = '<span class="selected-chips-empty">加入课程后，可点击课表块查看详情</span>';
      return;
    }
    container.innerHTML = selectedCourses.map((course) => `
      <span class="selected-chip">
        <a href="course.html?code=${encodeURIComponent(course.code)}">${MSDS.escapeHtml(course.code)}</a>
        <span aria-hidden="true">·</span>
      </span>`).join("");
  }

  function minutes(time) {
    const [hours, mins] = time.split(":").map(Number);
    return hours * 60 + mins;
  }

  function selectedEvents() {
    const events = [];
    programmeCourses().forEach((course, courseIndex) => {
      const selected = selections[course.code];
      if (!selected) return;
      [selected.primaryCrn, selected.tutorialCrn].filter(Boolean).forEach((key) => {
        // 同一 CRN 可能一周上多次课（如周四+周三各一次），每条记录都要单独上课表；
        // 同一天同一时间出现多条记录（如同一节课分两个教室平行上课）则合并成一格，避免课表上出现“自己和自己冲突”的假重叠
        const meetings = course.eligible_sections.filter((item) => MSDS.sectionKey(item) === String(key));
        const byDayTime = new Map();
        meetings.forEach((item) => {
          if (!item.time || !DAYS.includes(item.day)) return;
          const dtKey = `${item.day}|${item.time}`;
          const existing = byDayTime.get(dtKey);
          if (!existing) {
            byDayTime.set(dtKey, item);
            return;
          }
          const rooms = new Set([existing, item].map((s) => [s.building, s.room].filter(Boolean).join(" ")).filter(Boolean));
          if (rooms.size > 1) byDayTime.set(dtKey, { ...existing, building: "", room: [...rooms].join(" / ") });
        });
        byDayTime.forEach((section, dtKey) => {
          const [startText, endText] = section.time.split(" - ");
          events.push({
            id: `${course.code}-${key}-${dtKey}`,
            course,
            section,
            start: minutes(startText),
            end: minutes(endText),
            color: COLORS[courseIndex % COLORS.length],
            conflict: false,
            lane: 0,
            laneCount: 1
          });
        });
      });
    });

    events.forEach((event, index) => {
      events.slice(index + 1).forEach((other) => {
        if (event.section.day === other.section.day && event.start < other.end && other.start < event.end) {
          event.conflict = true;
          other.conflict = true;
        }
      });
    });

    DAYS.forEach((day) => {
      const dayEvents = events.filter((event) => event.section.day === day).sort((a, b) => a.start - b.start || a.end - b.end);
      const laneEnds = [];
      dayEvents.forEach((event) => {
        let lane = laneEnds.findIndex((end) => end <= event.start);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = event.end;
        event.lane = lane;
      });
      const count = Math.max(1, laneEnds.length);
      dayEvents.forEach((event) => { event.laneCount = count; });
    });
    return events;
  }

  function renderTimeAxis() {
    const axis = document.getElementById("time-axis");
    axis.innerHTML = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => {
      const hour = START_HOUR + index;
      return `<span class="time-label" style="top:${index * 60}px">${String(hour).padStart(2, "0")}:00</span>`;
    }).join("");
  }

  function renderTimetable() {
    const events = selectedEvents();
    const columns = document.getElementById("day-columns");
    columns.innerHTML = DAYS.map((day) => {
      const blocks = events.filter((event) => event.section.day === day).map((event) => {
        const top = ((event.start - START_HOUR * 60) / 60) * 60;
        const height = Math.max(34, ((event.end - event.start) / 60) * 60);
        const width = 100 / event.laneCount;
        const left = event.lane * width;
        const room = [event.section.building, event.section.room].filter(Boolean).join(" ");
        const recommendation = MSDS.getRecommendation(event.course);
        const tooltipTags = recommendation.tags.slice(0, 3).map((tag) => `<span class="event-tooltip-tag">${MSDS.escapeHtml(tag)}</span>`).join("");
        return `<div class="course-event ${event.conflict ? "is-conflict" : ""} ${event.start >= 19 * 60 ? "tooltip-up" : ""} ${event.section.day === "F" ? "tooltip-left" : ""}" role="button" tabindex="0"
          data-event-code="${MSDS.escapeHtml(event.course.code)}"
          aria-label="查看 ${MSDS.escapeHtml(event.course.code)} 详情：${MSDS.escapeHtml(recommendation.verdict)}"
          style="top:${top}px;height:${height}px;left:calc(${left}% + 3px);width:calc(${width}% - 6px);--event-bg:${event.color[0]};--event-accent:${event.color[1]};--event-ink:${event.color[2]}">
          <span class="event-label"><strong>${MSDS.escapeHtml(event.course.code)} · ${MSDS.escapeHtml(event.section.section)}</strong>
            <span>${MSDS.escapeHtml(event.section.time)}</span>
            <span>${MSDS.escapeHtml(room)}</span>
          </span>
          <span class="event-overlay" role="tooltip">
            <span class="event-overlay-content"><strong>${MSDS.escapeHtml(event.course.programme_title)}</strong><span>${MSDS.escapeHtml(MSDS.DAY_NAMES[event.section.day])} · ${MSDS.escapeHtml(event.section.time)}</span><span>${MSDS.escapeHtml(room || "地点待定")}</span><span class="event-tooltip-tags">${tooltipTags || `<span class="event-tooltip-tag">${MSDS.escapeHtml(recommendation.verdict)}</span>`}</span></span>
            <span class="event-overlay-actions"><a href="course.html?code=${encodeURIComponent(event.course.code)}" data-event-link>详情</a><button type="button" data-event-remove="${MSDS.escapeHtml(event.course.code)}">删除</button></span>
          </span>
        </div>`;
      }).join("");
      return `<div class="day-column" data-day-column="${day}">${blocks}</div>`;
    }).join("");

    document.getElementById("empty-timetable").hidden = events.length > 0;
    const conflicts = events.filter((event) => event.conflict);
    const status = document.getElementById("conflict-status");
    if (conflicts.length) {
      status.className = "conflict-status has-conflict";
      status.textContent = `${new Set(conflicts.map((event) => event.course.code)).size} 门课程冲突`;
    } else {
      status.className = "conflict-status is-clear";
      status.textContent = "暂无冲突";
    }
  }

  function updateSummary() {
    const selectedCourses = programmeCourses().filter((course) => selections[course.code]);
    const coreCourses = selectedCourses.filter((course) => requirementTypeOf(course) === "core");
    const electiveCourses = selectedCourses.filter((course) => requirementTypeOf(course) === "elective");
    const sumCredits = (items) => items.reduce((sum, course) => sum + Number(course.credits || 0), 0);

    document.getElementById("core-count").textContent = coreCourses.length;
    document.getElementById("core-credit-count").textContent = sumCredits(coreCourses);
    document.getElementById("elective-count").textContent = electiveCourses.length;
    document.getElementById("elective-credit-count").textContent = sumCredits(electiveCourses);
    document.getElementById("selected-count").textContent = selectedCourses.length;
    document.getElementById("selected-tab-count").textContent = selectedCourses.length;
    document.getElementById("credit-count").textContent = sumCredits(selectedCourses);

    updateElectiveGroupSummary(electiveCourses, sumCredits);
  }

  // 展示 Group I / Group II 等选修分组的学分进度（如有配置），提示是否满足下限/上限
  function updateElectiveGroupSummary(electiveCourses, sumCredits) {
    const container = document.getElementById("elective-group-summary");
    if (!container) return;
    const programme = currentProgramme();
    const groups = programme?.requirement_credit_units?.elective_groups;
    if (!Array.isArray(groups) || !groups.length) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }
    container.hidden = false;
    const lang = MSDS.getStoredLang();
    container.innerHTML = groups.map((group) => {
      const groupCourses = electiveCourses.filter((course) => MSDS.getElectiveGroup(course, activeProgramme) === group.key);
      const credits = sumCredits(groupCourses);
      const belowMin = group.min_credits != null && credits < group.min_credits;
      const aboveMax = group.max_credits != null && credits > group.max_credits;
      const label = lang === "en" ? group.label_en : group.label_zh;
      const requirementText = lang === "en"
        ? (group.min_credits != null ? `min ${group.min_credits} credits` : `max ${group.max_credits} credits`)
        : (group.min_credits != null ? `至少 ${group.min_credits} 学分` : `至多 ${group.max_credits} 学分`);
      const selectedText = lang === "en" ? `${credits} credits selected` : `已选 ${credits} 学分`;
      return `<span class="elective-group-item ${belowMin || aboveMax ? "is-warn" : ""}">${MSDS.escapeHtml(label)}: ${selectedText} (${requirementText})</span>`;
    }).join("");
  }

  function renderAll() {
    MSDS.saveSelections(selections, activeProgramme);
    renderCourseList();
    renderSelectedList();
    renderSelectedChips();
    renderTimetable();
    updateSummary();
  }

  function applyDefaultSelections() {
    // 不再自动安排必修课/默认课程到课表。
    // 同学可能需要调整必修课时间，因此默认课表保持为空，由用户自行选择。
    const hasStored = Object.keys(selections).length > 0;
    if (hasStored) return;
    selections = {};
    MSDS.saveSelections(selections, activeProgramme);
  }

  function selectionForPrimary(course, primaryCrn, tutorialCrn) {
    const selection = MSDS.makeDefaultSelection(course);
    if (primaryCrn) {
      selection.primaryCrn = primaryCrn;
      const tutorials = course.eligible_sections.filter((section) => Number(section.credits) === 0);
      const matching = MSDS.makeDefaultSelection({
        ...course,
        eligible_sections: [MSDS.findSection(course, primaryCrn), ...tutorials].filter(Boolean)
      });
      selection.tutorialCrn = matching.tutorialCrn;
    }
    if (tutorialCrn) selection.tutorialCrn = tutorialCrn;
    return selection;
  }

  function toggleCourse(code, primaryCrn, tutorialCrn) {
    const course = courseByCode(code);
    if (!course) return;
    if (selections[code]) {
      delete selections[code];
      MSDS.showToast(`已移除 ${code}`);
    } else {
      selections[code] = selectionForPrimary(course, primaryCrn, tutorialCrn);
      MSDS.showToast(`已加入 ${code}`);
    }
    renderAll();
  }

  function switchCollege(key) {
    if (key === activeCollege) return;
    activeCollege = key;
    const depts = departments();
    activeDepartment = depts.length ? depts[0].key : "";
    const progs = departmentProgrammes();
    if (progs.length && !progs.some((p) => p.code === activeProgramme)) {
      const first = progs.find((p) => p.data_ready !== false);
      if (first) activeProgramme = first.code;
    }
    MSDS.saveProgramme(activeProgramme);
    renderProgrammePills();
    refreshAfterProgrammeChange();
  }

  function switchDepartment(key) {
    if (key === activeDepartment) return;
    activeDepartment = key;
    const progs = departmentProgrammes();
    if (progs.length && !progs.some((p) => p.code === activeProgramme)) {
      const first = progs.find((p) => p.data_ready !== false);
      if (first) activeProgramme = first.code;
    }
    MSDS.saveProgramme(activeProgramme);
    renderProgrammePills();
    refreshAfterProgrammeChange();
  }

  function refreshAfterProgrammeChange() {
    reloadSelections();
    applyDefaultSelections();
    renderProgrammeStats();
    renderAll();
    MSDS.showToast(`已切换至 ${currentProgramme().name_zh}`);
  }

  // ==================== 选课结果导出 / 导入（纯文本） ====================
  function selectionsToText() {
    const lines = [
      "# CityU 选课结果导出",
      `# Programme: ${activeProgramme}`,
      `# Exported: ${new Date().toISOString()}`,
      ""
    ];
    Object.keys(selections).sort().forEach((code) => {
      const selected = selections[code];
      const course = courseByCode(code);
      const primarySection = course && selected.primaryCrn ? MSDS.findSection(course, selected.primaryCrn) : null;
      const note = course
        ? ` # ${course.programme_title}${primarySection ? " · " + MSDS.formatSection(primarySection) : ""}`
        : "";
      lines.push(`${code} | Primary=${selected.primaryCrn || "-"} | Tutorial=${selected.tutorialCrn || "-"}${note}`);
    });
    return lines.join("\n") + "\n";
  }

  function exportSelectionsAsText() {
    if (!Object.keys(selections).length) {
      MSDS.showToast("还没有选课，无法导出");
      return;
    }
    const text = selectionsToText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cityu-selection-${activeProgramme}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    MSDS.showToast("已导出选课结果");
  }

  // 解析形如 "COMP5111 | Primary=12345 | Tutorial=12346" 的行；# 开头为注释，行内 # 之后的内容视为备注忽略
  function parseSelectionsText(text) {
    return text.split(/\r?\n/)
      .map((rawLine) => rawLine.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const match = line.match(/^([A-Za-z0-9]+)\s*\|\s*Primary=([^|#]+?)\s*(?:\|\s*Tutorial=([^|#]+?)\s*)?(?:#.*)?$/);
        if (!match) return { raw: line, error: "格式无法解析" };
        const [, code, primaryRaw, tutorialRaw] = match;
        return {
          code: code.toUpperCase(),
          primaryCrn: primaryRaw && primaryRaw.trim() !== "-" ? primaryRaw.trim() : null,
          tutorialCrn: tutorialRaw && tutorialRaw.trim() !== "-" ? tutorialRaw.trim() : null
        };
      });
  }

  function importSelectionsFromText(text) {
    const parsed = parseSelectionsText(text);
    if (!parsed.length) {
      MSDS.showToast("文件内容为空或格式不正确");
      return;
    }
    if (!window.confirm(`将导入 ${parsed.length} 门课程，覆盖当前「${activeProgramme}」的选课结果，确定继续吗？`)) return;

    const nextSelections = {};
    const skipped = [];
    parsed.forEach((item) => {
      if (item.error) { skipped.push(`${item.raw}（${item.error}）`); return; }
      const course = courseByCode(item.code);
      if (!course) { skipped.push(`${item.code}（当前项目中找不到该课程）`); return; }
      const primarySection = item.primaryCrn ? MSDS.findSection(course, item.primaryCrn) : null;
      if (item.primaryCrn && !primarySection) { skipped.push(`${item.code}（主课班次 ${item.primaryCrn} 不存在，可能已变更，已跳过整门课）`); return; }
      const tutorialSection = item.tutorialCrn ? MSDS.findSection(course, item.tutorialCrn) : null;
      if (item.tutorialCrn && !tutorialSection) skipped.push(`${item.code}（Tutorial 班次 ${item.tutorialCrn} 不存在，已忽略该 Tutorial）`);
      nextSelections[item.code] = {
        primaryCrn: primarySection ? item.primaryCrn : null,
        tutorialCrn: tutorialSection ? item.tutorialCrn : null
      };
    });

    selections = nextSelections;
    renderAll();
    const successCount = Object.keys(nextSelections).length;
    MSDS.showToast(`已导入 ${successCount} 门课程${skipped.length ? `，跳过 ${skipped.length} 项` : ""}`);
    if (skipped.length) console.warn("导入选课结果时跳过的记录：", skipped);
  }

  function switchProgramme(code) {
    if (code === activeProgramme) return;
    const available = programmes.find((p) => p.code === code);
    const hasCourses = courses.some((course) => MSDS.courseProgrammes(course, data).includes(code));
    if (!available || !hasCourses) {
      MSDS.showToast("该项目的课程数据待补充");
      return;
    }
    activeProgramme = code;
    MSDS.saveProgramme(code);
    reloadSelections();
    applyDefaultSelections();
    renderProgrammePills();
    renderProgrammeStats();
    renderAll();
    MSDS.showToast(`已切换至 ${currentProgramme().name_zh}`);
  }

  function bindEvents() {
    document.getElementById("course-search").addEventListener("input", (event) => {
      searchTerm = event.target.value.trim();
      renderCourseList();
    });

    document.querySelector(".filter-row")?.addEventListener("click", (event) => {
      const button = event.target.closest(".filter-pill");
      if (!button) return;
      activeFilter = button.dataset.filter;
      document.querySelectorAll(".filter-pill").forEach((item) => item.classList.toggle("active", item === button));
      renderCourseList();
    });

    document.querySelectorAll(".day-filter-pill").forEach((button) => {
      button.addEventListener("click", () => {
        activeDay = button.dataset.dayFilter;
        document.querySelectorAll(".day-filter-pill").forEach((item) => item.classList.toggle("active", item === button));
        renderCourseList();
      });
    });

    document.getElementById("term-filter-row")?.addEventListener("click", (event) => {
      const button = event.target.closest(".term-filter-pill");
      if (!button) return;
      activeSemester = button.dataset.termFilter;
      document.querySelectorAll("#term-filter-row .term-filter-pill").forEach((item) => item.classList.toggle("active", item === button));
      renderCourseList();
    });

    document.querySelectorAll(".segment").forEach((button) => {
      button.addEventListener("click", () => {
        const selectedPanel = button.dataset.panel;
        document.querySelectorAll(".segment").forEach((item) => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-selected", String(active));
        });
        document.getElementById("browse-panel").hidden = selectedPanel !== "browse";
        document.getElementById("selected-panel").hidden = selectedPanel !== "selected";
      });
    });

    document.getElementById("programme-pills").addEventListener("click", (event) => {
      const pill = event.target.closest("[data-programme]");
      if (pill) switchProgramme(pill.dataset.programme);
    });

    const collegePills = document.getElementById("college-pills");
    if (collegePills) collegePills.addEventListener("click", (event) => {
      const pill = event.target.closest("[data-college]");
      if (pill) switchCollege(pill.dataset.college);
    });

    const departmentPills = document.getElementById("department-pills");
    if (departmentPills) departmentPills.addEventListener("click", (event) => {
      const pill = event.target.closest("[data-department]");
      if (pill) switchDepartment(pill.dataset.department);
    });

    listElement.addEventListener("click", (event) => {
      const button = event.target.closest("[data-code]");
      if (!button) return;
      const row = button.closest(".course-row");
      const sectionSelect = row?.querySelector("[data-quick-section]");
      const tutorialSelect = row?.querySelector("[data-quick-tutorial]");
      toggleCourse(button.dataset.code, sectionSelect?.value, tutorialSelect?.value);
    });

    listElement.addEventListener("change", (event) => {
      const sectionSelect = event.target.closest("[data-quick-section]");
      const tutorialSelect = event.target.closest("[data-quick-tutorial]");
      const select = sectionSelect || tutorialSelect;
      if (!select) return;
      const code = sectionSelect ? select.dataset.quickSection : select.dataset.quickTutorial;
      if (!selections[code]) return;
      const course = courseByCode(code);
      if (sectionSelect) {
        selections[course.code] = selectionForPrimary(course, select.value);
      } else {
        selections[course.code].tutorialCrn = select.value || null;
      }
      renderAll();
      MSDS.showToast(`已切换 ${course.code} 班次`);
    });

    selectedListElement.addEventListener("change", (event) => {
      const select = event.target.closest("select[data-code]");
      if (!select) return;
      const code = select.dataset.code;
      const course = courseByCode(code);
      if (!course || !selections[code]) return;
      if (select.dataset.kind === "primary") {
        selections[code] = selectionForPrimary(course, select.value);
      } else {
        selections[code].tutorialCrn = select.value || null;
      }
      renderAll();
    });

    document.getElementById("day-columns").addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-event-remove]");
      if (removeButton) {
        event.stopPropagation();
        toggleCourse(removeButton.dataset.eventRemove);
        return;
      }
      if (event.target.closest("[data-event-link]")) return;
      const block = event.target.closest("[data-event-code]");
      if (block) window.location.href = `course.html?code=${encodeURIComponent(block.dataset.eventCode)}`;
    });

    document.getElementById("day-columns").addEventListener("keydown", (event) => {
      const block = event.target.closest("[data-event-code]");
      if (!block || (event.key !== "Enter" && event.key !== " ")) return;
      if (event.target.closest("[data-event-remove]") || event.target.closest("[data-event-link]")) return;
      event.preventDefault();
      window.location.href = `course.html?code=${encodeURIComponent(block.dataset.eventCode)}`;
    });

    document.getElementById("clear-selection").addEventListener("click", () => {
      selections = {};
      renderAll();
      MSDS.showToast("课表已清空");
    });

    document.getElementById("export-selection").addEventListener("click", exportSelectionsAsText);

    const importFileInput = document.getElementById("import-selection-file");
    document.getElementById("import-selection").addEventListener("click", () => {
      importFileInput.value = "";
      importFileInput.click();
    });
    importFileInput.addEventListener("change", () => {
      const file = importFileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => importSelectionsFromText(String(reader.result || ""));
      reader.readAsText(file);
    });
  }

  MSDS.loadCourseData().then((loadedData) => {
    data = loadedData;
    courses = data.courses;
    programmes = MSDS.getProgrammes(data);
    reloadSelections();
    // 默认展开当前项目所在的学院与院系，避免级联行初始为空
    const startingProgramme = currentProgramme();
    activeCollege = startingProgramme.college_en || "College of Computing";
    activeDepartment = startingProgramme.department_en || startingProgramme.department || "Department";
    renderProgrammePills();
    renderProgrammeStats();
    renderTimeAxis();
    bindEvents();
    applyDefaultSelections();
    renderAll();
  }).catch((error) => {
    listElement.innerHTML = `<div class="empty-list">${MSDS.escapeHtml(error.message)}<br>请通过本地服务器打开网站。</div>`;
  });
})();
