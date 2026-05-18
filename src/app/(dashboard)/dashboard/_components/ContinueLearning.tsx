"use client";

import Link from "next/link";
import { ChevronRight, GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CourseProgressCard, type Course } from "./CourseProgressCard";

interface ContinueLearningProps {
  enrolledCourses: Course[];
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center px-4">
      <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
        <GraduationCap className="w-6 h-6 text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-700 mb-1">No enrolled courses</p>
      <p className="text-xs text-slate-400 mb-4 max-w-[180px]">
        Browse the catalog to enroll and start learning.
      </p>
      <Link href="/courses">
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-4 rounded-lg">
          Explore Catalog
        </Button>
      </Link>
    </div>
  );
}

export default function ContinueLearning({ enrolledCourses }: ContinueLearningProps) {
  // Responsive cap: 3 on mobile, 4 on tablet (md), 3 on desktop (lg).
  // We render at most 4 and CSS-hide the 4th outside the tablet range
  // (SSR-safe, no hydration mismatch / layout shift).
  const shown = enrolledCourses.slice(0, 4);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-end px-1">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900 tracking-tight">Continue Learning</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Pick up right where you left off</p>
        </div>
        <Link href="/dashboard/my-courses">
          <Button
            variant="ghost"
            size="sm"
            className="text-[12px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-7 px-2 gap-0.5"
          >
            All my courses
            <ChevronRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>

      {/* Content */}
      {shown.length === 0 ? (
        <Card className="border-slate-200 shadow-sm rounded-2xl">
          <CardContent className="p-0">
            <EmptyState />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.map((course, i) => (
            <CourseProgressCard
              key={course.id}
              course={course}
              index={i}
              className={i === 3 ? "hidden md:block lg:hidden" : "block"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
