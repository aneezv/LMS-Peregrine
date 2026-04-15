"use client";

import Link from "next/link";
import { BookOpen, ChevronRight, GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface Course {
  id: string;
  title: string;
  course_code: string;
  progress?: number;
  thumbnail_url?: string;
}

interface ContinueLearningProps {
  enrolledCourses: Course[];
}

function ProgressLabel({ progress }: { progress: number }) {
  if (progress === 0)
    return <span className="text-[10px] text-slate-400 font-medium">Not started</span>;
  if (progress === 100)
    return <span className="text-[10px] text-emerald-600 font-semibold">Completed</span>;
  return <span className="text-[10px] text-blue-600 font-semibold">In Progress</span>;
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
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-end px-1">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900 tracking-tight">Continue Learning</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Pick up right where you left off</p>
        </div>
        <Link href="/courses">
          <Button
            variant="ghost"
            size="sm"
            className="text-[12px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-7 px-2 gap-0.5"
          >
            Browse all
            <ChevronRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>

      {/* Content */}
      {enrolledCourses.length === 0 ? (
        <Card className="border-slate-200 shadow-sm rounded-2xl">
          <CardContent className="p-0">
            <EmptyState />
          </CardContent>
        </Card>
      ) : (
        /* 1-col on mobile, 2-col on md+ screens */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {enrolledCourses.map((course, i) => {
            const progress = course.progress ?? 0;
            const tile = TILE_STYLES[i % TILE_STYLES.length];
            const barColor = PROGRESS_BAR_COLORS[i % PROGRESS_BAR_COLORS.length];

            return (
              <Link key={course.id} href={`/courses/${course.id}`} className="block group">
                <Card
                  className={cn(
                    "border-slate-200 shadow-sm rounded-2xl overflow-hidden transition-all duration-200",
                    "hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Icon tile */}
                      <div
                        className={cn(
                          "shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors duration-200",
                          tile.bg
                        )}
                      >
                        {course.thumbnail_url ? (
                          <img
                            src={toRenderableImageUrl(course.thumbnail_url)}
                            alt={course.title}
                            className="w-full h-full object-cover rounded-xl"
                          />
                        ) : (
                          <BookOpen className={cn("w-5 h-5", tile.icon)} />
                        )}
                      </div>

                      {/* Body */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="min-w-0 flex-1">
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-semibold text-slate-400 bg-slate-100 hover:bg-slate-100 mb-1.5 px-1.5 h-4 uppercase tracking-wider"
                            >
                              {course.course_code}
                            </Badge>
                            <h3 className="text-[13px] font-semibold text-slate-800 leading-snug group-hover:text-blue-700 transition-colors duration-200 line-clamp-2">
                              {course.title}
                            </h3>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all duration-200 mt-1 shrink-0" />
                        </div>

                        {/* Progress */}
                        <div className="mt-2.5 space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] text-slate-400">
                              {progress}% complete
                            </span>
                            <ProgressLabel progress={progress} />
                          </div>
                          <Progress
                            value={progress}
                            className={cn(
                              "h-1.5 bg-slate-100 [&>div]:rounded-full [&>div]:transition-all [&>div]:duration-500",
                              barColor
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}