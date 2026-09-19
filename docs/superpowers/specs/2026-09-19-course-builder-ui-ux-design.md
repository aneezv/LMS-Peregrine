# Course Builder UI/UX Revamp Specification

**Date**: 2026-09-19  
**Status**: Approved by User  
**Target Route**: `/admin/courses/[id]/edit` and `/admin/courses/new`  
**Core Components**: `src/components/CourseBuilder.tsx` & `src/components/course-builder/*`

---

## 1. Executive Summary & Goals

The Course Builder is the primary authoring tool for educators and administrators on LMS Peregrine. Currently, `CourseBuilder.tsx` is a 2,777-line monolithic component that places course metadata, media uploads, pricing, and the entire curriculum builder into a single tall scrolling page.

### Key Pain Points Solved
1. **Excessive Vertical Scrolling**: Educators editing an existing course must scroll past hundreds of pixels of metadata just to edit lesson content.
2. **Cramped Workbench**: The curriculum editor (sections and lessons) is confined to a tight 2-column grid nested inside a general card, restricting horizontal space for quiz questions, session settings, and assignments.
3. **Monolithic Maintenance Burden**: All state management, sub-module forms, validation, drag-and-drop, and Supabase mutations live inside a single 2,777-line file.
4. **Terminology Compliance**: Ensuring strict alignment with project rules — specifically using **"Lesson / Lessons"** across all user-facing copy (never "Module / Modules").

### Solution Architecture
Transform the Course Builder into a **Modular Tabbed Studio Workbench**:
- **Sticky Studio Header**: Course title, course code, publication status badge (`Draft` / `Published`), unsaved changes indicator, preview link, save draft, and publish actions.
- **Three Dedicated Tabs**:
  1. **Curriculum** (Default for editing): A split-pane workbench with draggable sections and lessons tree on the left, and a focused lesson editor on the right.
  2. **Course Details**: Clean 2-column layout for title, code, department, instructor assignment, description, thumbnail upload with live preview, and demo video player.
  3. **Pricing & Access**: Price (₹), discount percentage with live computed learner price calculation, and enrollment type.
- **Component Decomposition**: Break down the 2,777-line monolith into focused, testable subcomponents in `src/components/course-builder/`.
- **Zero Data Loss & Strict Rollback**: Preserve all existing Supabase queries, relational updates (`module_content`, `module_session`, `module_quiz_settings`, `assignments`, `quiz_questions`, `quiz_options`, `module_external_links`), and state-rollback on save errors.

---

## 2. Layout & Information Architecture

### 2.1 Sticky Studio Header (`CourseBuilderHeader.tsx`)
```
+----------------------------------------------------------------------------------------------------+
| < Courses / CS101-A   Introduction to Web Development  [Published]  [● Unsaved]    [Preview] [Save Draft] [Publish] |
+----------------------------------------------------------------------------------------------------+
|  [ Curriculum (14) ]    [ Course Details ]    [ Pricing & Access ]                                 |
+----------------------------------------------------------------------------------------------------+
```
- **Breadcrumb & Title**: Links back to `/admin/courses`, displays course code and live-updated course title.
- **Status Badge**:
  - `Draft`: Amber badge (`border-amber-200 bg-amber-50 text-amber-800`).
  - `Published`: Emerald badge (`border-emerald-200 bg-emerald-50 text-emerald-800`).
- **Unsaved Changes Indicator**: Subtle dot with status text when modifications exist against baseline snapshot.
- **Action Buttons**:
  - `Preview Course`: Opens `/courses/[id]` in a new tab if saved.
  - `Delete Course`: Danger button / icon trigger with confirmation modal (when editing existing course).
  - `Save draft`: Secondary action button with loading spinner.
  - `Publish Course` / `Save Changes`: Primary solid action button with loading spinner.

---

### 2.2 Tab 1: Curriculum Workbench (`CurriculumTab.tsx`)
Split into a two-pane workbench:

#### Left Pane: Curriculum Tree (~38% width, min 340px)
- **Toolbar**:
  - Search / filter input for quick lesson navigation in large courses.
  - "Paste Lesson" button (reads serialized clipboard data).
  - "+ Add Section" button (dashed outline or primary button).
- **Draggable Sections & Lessons List** (Powered by `@dnd-kit/core` & `@dnd-kit/sortable`):
  - **Section Container**:
    - Header: Section number badge, title (click to inline edit), lesson count pill (`3 lessons`), Move Up / Move Down buttons, "+ Add Lesson" button, and Delete Section button (with dialog confirmation if section contains lessons).
    - Draggable Lesson Items:
      - Drag handle grip.
      - Week badge (e.g. `W1`, `W2`).
      - Type icon with semantic colors:
        - 🎬 Video: Blue
        - 📝 Quiz: Cyan
        - 📄 Assignment: Green
        - 📹 Live Session: Purple
        - 📍 Offline Session: Amber
        - 💬 Feedback: Rose
        - 🔗 External Resource: Indigo
      - Lesson title (truncated if long).
      - Quick actions on hover: "Copy Lesson" to clipboard, "Delete Lesson".
      - Active highlight: Highlighted border and soft background when currently being edited in right pane.

#### Right Pane: Focused Lesson Editor (~62% width, flex-1)
- **Empty State**: When no lesson is selected, displays a clean illustrated prompt with "Select a lesson from the curriculum or add a new lesson".
- **Active Lesson Canvas**:
  - **Header & Type Selector**:
    - Lesson Title input with validation.
    - Type selector button group with icons.
    - Section selector dropdown to quickly reassign section.
  - **Unlock Schedule Card**:
    - Week number stepper.
    - Unlock Mode radio toggle:
      - *Auto (Course Start + Week)*: Computes and previews exact unlock timestamp.
      - *Manual*: Datetime-local picker.
  - **Type-Specific Submodule Editors**:
    - **Video**: Video URL input with YouTube/Vimeo validator.
    - **Quiz / MCQ (`QuizEditor.tsx`)**:
      - Passing score % input.
      - Allow retest checkbox.
      - Exam mode countdown timer (minutes) and question randomization toggle.
      - Bulk CSV dropzone and paste importer with format instructions and error feedback.
      - Interactive Question Cards: question prompt textarea, option rows with radio buttons for single-correct answer, "+ Add Option", and "+ Add Question".
    - **Assignment (`AssignmentEditor.tsx`)**:
      - Instructions/description textarea.
      - Max score and passing score inputs.
      - Optional submission deadline picker.
    - **Live / Offline Session (`SessionEditor.tsx`)**:
      - Live: Meeting URL, session start at, session end at.
      - Offline: Venue/room location, session start/end at, instructions textarea.
    - **External Resources (`ExternalResourcesEditor.tsx`)**:
      - Shared description textarea.
      - Dynamic list of labeled URL rows with "+ Add Link" and remove button.
    - **Feedback**:
      - Instructions/prompt textarea for learner submissions.

---

### 2.3 Tab 2: Course Details (`CourseDetailsTab.tsx`)
Balanced 2-column grid layout:
- **Left Column**:
  - Course Title (required).
  - Course Code (required, unique identifier e.g. `CS101-A`).
  - Department (required, populated from `departments` table).
  - Instructor selector (Admin only, populated from `profiles` with role instructor/admin).
  - Description (multi-line textarea).
  - Course Start Date (datetime-local picker for synchronizing automated weekly unlocks).
- **Right Column**:
  - Thumbnail Image Card:
    - Drag-and-drop / file selector integrating with `/api/courses/thumbnail-upload`.
    - Live image preview with cache-busting versioning.
    - URL input for manual image URLs or Google Drive image links.
  - Demo Video Card:
    - YouTube / Vimeo URL input.
    - Responsive embedded video player preview.

---

### 2.4 Tab 3: Pricing & Access (`PricingAccessTab.tsx`)
- Course Price (₹): 0 indicates free course.
- Discount (%): 0 to 100%.
- Interactive Calculation Banner:
  - Live preview showing actual price paid by learner, e.g. `₹2,499 (50% off)` or `Free Course — no payment required`.
- Enrollment Type:
  - Open (anyone can enroll from catalog).
  - Invite Only (restricted access).

---

## 3. Component Hierarchy & File Structure

All subcomponents are located in `src/components/course-builder/`:

```
src/components/
├── CourseBuilder.tsx                   <-- Root coordinator & Supabase synchronization
└── course-builder/
    ├── types.ts                        <-- ModuleItem, SectionItem, and subtype types
    ├── CourseBuilderHeader.tsx         <-- Sticky top header with action buttons
    ├── CourseDetailsTab.tsx            <-- Metadata, instructor, thumbnail, demo video
    ├── PricingAccessTab.tsx            <-- Price, discount calculation, enrollment
    ├── CurriculumTab.tsx               <-- Split-pane curriculum workbench
    ├── CurriculumSectionItem.tsx       <-- Collapsible section with reorder controls
    ├── LessonListItem.tsx              <-- Draggable lesson item in tree
    ├── LessonEditor.tsx                <-- Focused lesson editor canvas
    └── editors/
        ├── QuizEditor.tsx              <-- Questions, options, bulk CSV importer
        ├── AssignmentEditor.tsx        <-- Scoring, instructions, deadline
        ├── SessionEditor.tsx           <-- Live meeting and offline venue sessions
        └── ExternalResourcesEditor.tsx <-- Dynamic links list
```

---

## 4. Data Flow, Persistence & Rollback Guarantees

1. **Root State Container**:
   - `CourseBuilder.tsx` maintains the complete state (`title`, `courseCode`, `departmentId`, `sections`, `modules`, `price`, etc.).
   - Tracks modified and deleted IDs: `deletedSectionIds`, `modifiedModuleIds`, `deletedModuleIds`.
2. **Deterministic Baseline Snapshot**:
   - Calculates JSON snapshot of baseline data to detect unsaved changes and warn user on browser unload.
3. **Database Transactions**:
   - `courses` table update / insert.
   - `sections` table sync: deleted sections deleted, new sections inserted, existing updated.
   - `modules` table sync: ordered by curriculum sequence `sort_order`.
   - Subtype tables sync:
     - `module_content`
     - `module_session`
     - `module_quiz_settings`
     - `assignments`
     - `quiz_questions` & `quiz_options`
     - `module_external_links`
4. **Failure Rollback**:
   - In case of network or Supabase exception during save, all local state is cleanly restored from `backupState` and an alert toast is shown to the user.

---

## 5. Verification & Testing Strategy

1. **TypeScript & Linter Checks**:
   - Run `npx tsc --noEmit` and ESLint to verify zero type mismatches or missing imports.
2. **Next.js Production Build**:
   - Run `npm run build` to confirm zero compilation errors.
3. **Functional Verification in Browser (`http://localhost:3000/admin/courses/[id]/edit`)**:
   - Verify all 3 tabs switch seamlessly without state loss.
   - Verify adding, renaming, moving, and deleting sections.
   - Verify adding, configuring, reordering, and deleting lessons.
   - Verify quiz creation, option toggle, and CSV bulk import.
   - Verify thumbnail upload and demo video live player preview.
   - Verify saving draft, publishing, and unsaved changes indicator.
   - Verify strict usage of "Lesson" instead of "Module" across all UI labels and toasts.
