# Course Builder UI/UX Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the monolithic 2,777-line Course Builder into a modern, high-productivity Tabbed Studio Workbench with a split-pane curriculum editor, dedicated course details and pricing tabs, and clean modular subcomponents while preserving all database synchronizations, schemas, and rollback mechanisms.

**Architecture:** Decompose `src/components/CourseBuilder.tsx` into a lightweight root coordinator and focused subcomponents under `src/components/course-builder/`. The root coordinator manages state, snapshot dirty tracking, and Supabase mutations. The UI is split into a sticky studio header, studio tab bar, a 2-column Curriculum Workbench (tree on left, focused lesson editor on right), a Course Details tab, and a Pricing & Access tab.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, `@dnd-kit/core`, `@dnd-kit/sortable`, Lucide React, Sonner, Supabase Client.

**Spec:** [`docs/superpowers/specs/2026-09-19-course-builder-ui-ux-design.md`](file:///C:/Projects/LMS%20Peregrine/docs/superpowers/specs/2026-09-19-course-builder-ui-ux-design.md)

## Global Constraints

- In all user-facing UI copy, use **Lesson/Lessons** instead of **Module/Modules** (e.g. "Add Lesson", "12 Lessons", "Configure Lesson").
- Database schema, API field names, routes, and internal identifiers remain unchanged (`modules`, `module_content`, `module_quiz_settings`, `module_session`, `assignments`, `quiz_questions`, `quiz_options`, `module_external_links`).
- Preserve deterministic baseline snapshot comparison and browser unload warning when changes are unsaved.
- Preserve full transactional rollback on save failure.

---

### Task 1: Shared Types & Serialization Utilities

**Files:**
- Create: `src/components/course-builder/types.ts`

**Interfaces:**
- Produces: `SectionItem`, `ModuleType`, `ModuleItem`, `QuizQuestion`, `QuizOption`, `ExternalLink`, `serializeModuleForClipboard`, `parseModuleFromClipboard`, `remapModuleIds`, `makeSection`, `makeModule`, `normalizeModuleType`

- [ ] **Step 1: Create `src/components/course-builder/types.ts`**
  Define all domain types and clipboard serialization helpers previously embedded in `CourseBuilder.tsx`.
- [ ] **Step 2: Typecheck**
  Run `npx tsc --noEmit` to verify type safety.
- [ ] **Step 3: Commit**
  `git add src/components/course-builder/types.ts && git commit -m "feat(course-builder): add domain types and clipboard utilities"`

---

### Task 2: Submodule Editors (`QuizEditor`, `AssignmentEditor`, `SessionEditor`, `ExternalResourcesEditor`)

**Files:**
- Create: `src/components/course-builder/editors/QuizEditor.tsx`
- Create: `src/components/course-builder/editors/AssignmentEditor.tsx`
- Create: `src/components/course-builder/editors/SessionEditor.tsx`
- Create: `src/components/course-builder/editors/ExternalResourcesEditor.tsx`

**Interfaces:**
- Consumes: `ModuleItem`, `QuizQuestion`, `QuizOption`, `ExternalLink` from `../types`
- Produces: Submodule editor components with clean card layouts, validation, CSV import for quizzes, and reactive callbacks

- [ ] **Step 1: Implement `QuizEditor.tsx`**
  Build the Quiz & MCQ editor featuring: passing score percentage, allow-retest toggle, time limit in minutes, randomize questions switch, CSV drag/drop or paste bulk importer with syntax warnings, and question cards with options and correct-answer radio selection.
- [ ] **Step 2: Implement `AssignmentEditor.tsx`**
  Build the Assignment editor featuring: instructions textarea, max score, passing score, and submission deadline picker.
- [ ] **Step 3: Implement `SessionEditor.tsx`**
  Build Live and Offline session editors featuring: meeting link (live) or venue/location (offline), start/end datetimes, and preparation instructions.
- [ ] **Step 4: Implement `ExternalResourcesEditor.tsx`**
  Build the external links editor featuring: shared description and dynamic link rows (label + URL).
- [ ] **Step 5: Verify types and commit**
  `git add src/components/course-builder/editors/ && git commit -m "feat(course-builder): implement specialized lesson subtype editors"`

---

### Task 3: Curriculum Tree Components (`LessonListItem`, `CurriculumSectionItem`)

**Files:**
- Create: `src/components/course-builder/LessonListItem.tsx`
- Create: `src/components/course-builder/CurriculumSectionItem.tsx`

**Interfaces:**
- Consumes: `@dnd-kit/sortable`, `SortableItem`, `SectionItem`, `ModuleItem` from `types`
- Produces:
  - `LessonListItem`: Draggable lesson card with week badge, type icon badge, active ring highlight, and quick action buttons (copy, delete).
  - `CurriculumSectionItem`: Section container with drag handle, section index badge, inline title editor (enter to save, esc to cancel), lesson counter, move up/down buttons, "+ Add Lesson", and delete section button.

- [ ] **Step 1: Implement `LessonListItem.tsx`**
  Create sortable lesson item with drag handle, semantic type styling, week pill, selection handler, and hover copy/delete actions.
- [ ] **Step 2: Implement `CurriculumSectionItem.tsx`**
  Create section card with header toolbar, inline editing state, empty state when section has 0 lessons, and container for lesson items.
- [ ] **Step 3: Verify types and commit**
  `git add src/components/course-builder/LessonListItem.tsx src/components/course-builder/CurriculumSectionItem.tsx && git commit -m "feat(course-builder): implement curriculum tree and lesson list components"`

---

### Task 4: Focused Lesson Editor Canvas (`LessonEditor.tsx`)

**Files:**
- Create: `src/components/course-builder/LessonEditor.tsx`

**Interfaces:**
- Consumes: `ModuleItem`, `SectionItem`, subtype editors from `./editors`
- Produces: `LessonEditor` component rendering the active lesson editing panel (or clean empty state if none selected).

- [ ] **Step 1: Implement `LessonEditor.tsx`**
  Render lesson title input, type selector segmented button grid with icons, section dropdown, unlock schedule card with live preview of unlock timestamp (`Course starts_at + week offset`), and the matching subtype editor.
- [ ] **Step 2: Verify types and commit**
  `git add src/components/course-builder/LessonEditor.tsx && git commit -m "feat(course-builder): implement focused lesson editor canvas"`

---

### Task 5: Curriculum Tab Split-Pane Workbench (`CurriculumTab.tsx`)

**Files:**
- Create: `src/components/course-builder/CurriculumTab.tsx`

**Interfaces:**
- Consumes: `DndContext`, `CurriculumSectionItem`, `LessonEditor`, `SectionItem`, `ModuleItem`
- Produces: `CurriculumTab` component hosting the split-pane layout:
  - Left pane (38%): filter input, paste lesson button, "+ Add Section" button, draggable sections and lessons.
  - Right pane (62%): `LessonEditor`.

- [ ] **Step 1: Implement `CurriculumTab.tsx`**
  Integrate `@dnd-kit` sensors and `handleDragEnd` reordering across sections. Add quick filter for large courses.
- [ ] **Step 2: Verify types and commit**
  `git add src/components/course-builder/CurriculumTab.tsx && git commit -m "feat(course-builder): implement split-pane curriculum workbench"`

---

### Task 6: Course Details & Pricing Tabs (`CourseDetailsTab.tsx`, `PricingAccessTab.tsx`)

**Files:**
- Create: `src/components/course-builder/CourseDetailsTab.tsx`
- Create: `src/components/course-builder/PricingAccessTab.tsx`

**Interfaces:**
- Consumes: Course metadata props, department list, instructor choices, thumbnail upload handler, preview state
- Produces:
  - `CourseDetailsTab`: 2-column layout for title, code, department, instructor, description, thumbnail uploader with live preview, and demo video with player preview.
  - `PricingAccessTab`: Price, discount %, live calculated pricing banner, and enrollment type.

- [ ] **Step 1: Implement `CourseDetailsTab.tsx`**
  Clean card grid with visual inputs, thumbnail upload button and image hover/live preview, and YouTube/Vimeo embed preview.
- [ ] **Step 2: Implement `PricingAccessTab.tsx`**
  Price, discount slider/input with dynamic calculation badge, and open/invite-only enrollment selector.
- [ ] **Step 3: Verify types and commit**
  `git add src/components/course-builder/CourseDetailsTab.tsx src/components/course-builder/PricingAccessTab.tsx && git commit -m "feat(course-builder): implement course details and pricing tabs"`

---

### Task 7: Sticky Studio Header (`CourseBuilderHeader.tsx`)

**Files:**
- Create: `src/components/course-builder/CourseBuilderHeader.tsx`

**Interfaces:**
- Consumes: Course title, code, courseId, publish status, saving/deleting flags, unsaved changes boolean, callbacks
- Produces: Sticky top bar with breadcrumb, status badge, unsaved changes pill, preview link, delete course trigger, Save Draft button, and Publish Course button.

- [ ] **Step 1: Implement `CourseBuilderHeader.tsx`**
  Build responsive sticky header with visual states for saving, published, draft, and unsaved changes.
- [ ] **Step 2: Verify types and commit**
  `git add src/components/course-builder/CourseBuilderHeader.tsx && git commit -m "feat(course-builder): implement sticky studio header"`

---

### Task 8: Assemble Coordinator in `CourseBuilder.tsx` & Verify

**Files:**
- Modify: `src/components/CourseBuilder.tsx`

**Interfaces:**
- Consumes: All subcomponents from `./course-builder/`
- Coordinates: Data fetching from Supabase, state mutations, dirty snapshot comparison, rollback on error, confirmation dialogs, and tab navigation (`curriculum` | `details` | `pricing`).

- [ ] **Step 1: Refactor `CourseBuilder.tsx`**
  Replace the 2,777-line monolith with the clean coordinator delegating to `CourseBuilderHeader`, `CurriculumTab`, `CourseDetailsTab`, and `PricingAccessTab`. Keep all Supabase save, update, delete, and rollback logic intact.
- [ ] **Step 2: Run TypeScript check**
  Run `npx tsc --noEmit` and fix any type discrepancies.
- [ ] **Step 3: Run Next.js build verification**
  Run `npm run build` to ensure the entire application compiles with zero errors.
- [ ] **Step 4: Manual testing on `http://localhost:3000/admin/courses/b1c96010-36fa-483c-a2f5-9042d4aa5438/edit`**
  - Verify switching tabs ("Curriculum", "Course Details", "Pricing & Access").
  - Verify editing course metadata and media.
  - Verify dragging and dropping lessons between and within sections.
  - Verify creating and configuring different lesson types (Video, Quiz, Assignment, Session).
  - Verify saving draft and publish status.
- [ ] **Step 5: Commit**
  `git add src/components/CourseBuilder.tsx && git commit -m "refactor(course-builder): assemble tabbed studio workbench and complete revamp"`
