-- ============================================================
-- Peregrine LMS – Storage & RLS Setup
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Create the storage bucket for assignments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('eduflow-storage', 'eduflow-storage', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies to prevent "already exists" errors
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Learners can upload assignments" ON storage.objects;
DROP POLICY IF EXISTS "Learners can update own assignments" ON storage.objects;
DROP POLICY IF EXISTS "Users view assignments" ON public.assignments;

-- 2. Allow public access to view files (since bucket is public and we use public URLs)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'eduflow-storage' );

-- 3. Allow authenticated learners to upload their assignments
CREATE POLICY "Learners can upload assignments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'eduflow-storage' );

-- 4. Allow authenticated users to update their own files
CREATE POLICY "Learners can update own assignments"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'eduflow-storage' );

-- 5. Fix missing RLS SELECT policy for Assignments table
-- (Without this, the assignment page loads completely blank)
CREATE POLICY "Users view assignments" 
ON public.assignments FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.modules m 
    JOIN public.courses c ON c.id = m.course_id 
    WHERE m.id = assignments.module_id 
      AND (c.status = 'published' OR c.instructor_id = auth.uid())
  )
);
