"use client";

import Link from "next/link";
import Image from "next/image"; // Next.js Image component
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toRenderableImageUrl } from "@/lib/drive-image";

const TILE_STYLES = [
  { bg: "bg-blue-50",   icon: "text-blue-500"   },
  { bg: "bg-violet-50", icon: "text-violet-500" },
  { bg: "bg-emerald-50",icon: "text-emerald-500"},
  { bg: "bg-amber-50",  icon: "text-amber-500"  },
  { bg: "bg-rose-50",   icon: "text-rose-500"   },
];

const PROGRESS_BAR_COLORS = [
  "[&>div]:bg-blue-500",
  "[&>div]:bg-violet-500",
  "[&>div]:bg-emerald-500",
  "[&>div]:bg-amber-500",
  "[&>div]:bg-rose-500",
];

export interface Course {
  id: string;
  title: string;
  course_code: string;
  progress?: number;
  thumbnail_url?: string;
}

function ProgressLabel({ progress }: { progress: number }) {
  if (progress === 0)
    return <span className="text-[10px] text-slate-400 font-medium">Not started</span>;
  if (progress === 100)
    return <span className="text-[10px] text-emerald-600 font-semibold">Completed</span>;
  return <span className="text-[10px] text-blue-600 font-semibold">In Progress</span>;
}

/**
 * Single enrolled-course tile shared by the dashboard "Continue Learning"
 * section and the /dashboard/my-courses page so the visual stays identical.
 *
 * `className` controls the link wrapper's display utility. Pass the full
 * responsive display class (e.g. "hidden md:block lg:hidden"); it is NOT
 * combined with a default "block" to avoid Tailwind display-class conflicts.
 */
export function CourseProgressCard({
  course,
  index,
  className = "block",
}: {
  course: Course;
  index: number;
  className?: string;
}) {
  const progress = course.progress ?? 0;
  const tile = TILE_STYLES[index % TILE_STYLES.length];
  const barColor = PROGRESS_BAR_COLORS[index % PROGRESS_BAR_COLORS.length];

  return (
    <Link href={`/courses/${course.id}`} className={cn("group", className)}>
      <Card
        className={cn(
          "relative border-slate-200 shadow-sm rounded-2xl overflow-hidden transition-all duration-300",
          "hover:shadow-lg hover:border-blue-300 hover:-translate-y-1 h-full bg-white"
        )}
      >
        {/* 1. Background Thumbnail Layer */}
        <div className="absolute inset-0 z-0">
          {course.thumbnail_url ? (
            <Image
              src={toRenderableImageUrl(course.thumbnail_url)}
              alt={course.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 opacity-50 group-hover:scale-105 group-hover:opacity-100"
              quality={60} // Faster scroll performance
            />
          ) : (
            <div className={cn("w-full h-full opacity-10", tile.bg)} />
          )}

          {/* 2. Gradient Overlay for readability (Bottom-to-Top Fade) */}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-white/40" />
        </div>

        {/* 3. Content Layer */}
        <CardContent className="relative z-10 px-5 h-full flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Badge
                  variant="secondary"
                  className="text-[10px] font-bold text-slate-500 bg-white/90 border-slate-200 mb-2 px-2 h-5 uppercase tracking-wider"
                >
                  {course.course_code}
                </Badge>

                <h3 className="text-[13px] line-clamp-2 font-bold text-slate-800 leading-snug group-hover:text-blue-700 transition-colors duration-200">
                  {course.title}
                </h3>
              </div>

              <div className="shrink-0 mt-1">
                <div className="bg-white/80 p-1 rounded-full border border-slate-100 shadow-sm transition-colors group-hover:bg-blue-50">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all duration-200" />
                </div>
              </div>
            </div>
          </div>

          {/* Progress Section */}
          <div className="mt-8 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-medium text-slate-500">
                {progress}% complete
              </span>
              <ProgressLabel progress={progress} />
            </div>
            <Progress
              value={progress}
              className={cn(
                "h-1.5 bg-slate-200/50 [&>div]:rounded-full [&>div]:transition-all [&>div]:duration-500",
                barColor
              )}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
