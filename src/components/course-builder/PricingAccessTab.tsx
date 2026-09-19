'use client'

import React from 'react'
import { Label, FieldInput, FieldSelect } from './FormFields'
import { IndianRupee, Tag, ShieldCheck, Sparkles, CheckCircle2, Lock } from 'lucide-react'

interface PricingAccessTabProps {
  price: string
  setPrice: (val: string) => void
  discountPercent: string
  setDiscountPercent: (val: string) => void
  enrollmentType: 'open' | 'invite_only'
  setEnrollmentType: (val: 'open' | 'invite_only') => void
}

export function PricingAccessTab({
  price,
  setPrice,
  discountPercent,
  setDiscountPercent,
  enrollmentType,
  setEnrollmentType,
}: PricingAccessTabProps) {
  const numericPrice = Math.max(0, Number(price) || 0)
  const numericDiscount = Math.max(0, Math.min(100, Math.round(Number(discountPercent) || 0)))
  const effectivePrice = Math.round((numericPrice * (100 - numericDiscount)) / 100)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
      {/* Left Column: Pricing Controls (~60%) */}
      <div className="space-y-6 lg:col-span-7">
        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-7 shadow-xs space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4 text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <IndianRupee className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Tuition & Pricing
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label>Standard Course Price (₹ INR)</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <FieldInput
                  type="number"
                  min={0}
                  step={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0 for free"
                  className="pl-10 text-base font-semibold"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Set to 0 to make this course 100% free for all learners.
              </p>
            </div>

            <div>
              <Label>Discount Percentage (%)</Label>
              <div className="relative">
                <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <FieldInput
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="0"
                  disabled={numericPrice <= 0}
                  className="pl-10 text-base font-semibold"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {numericPrice > 0
                  ? 'Optional promotional discount applied at checkout.'
                  : 'Disabled for free courses.'}
              </p>
            </div>
          </div>

          {/* Interactive Pricing Summary Banner */}
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 sm:p-5 shadow-2xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Learner Pricing Preview
            </span>

            {numericPrice > 0 ? (
              <div className="mt-3 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-extrabold text-slate-900">
                  ₹{effectivePrice.toLocaleString('en-IN')}
                </span>
                {numericDiscount > 0 && (
                  <>
                    <span className="text-base text-slate-400 line-through">
                      ₹{numericPrice.toLocaleString('en-IN')}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                      {numericDiscount}% OFF
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 text-emerald-700">
                <Sparkles className="h-5 w-5" />
                <span className="text-xl font-bold">Free Course</span>
                <span className="text-xs font-medium text-emerald-800/80">
                  &mdash; Learners can enroll instantly without payment processing.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Enrollment & Access (~40%) */}
      <div className="space-y-6 lg:col-span-5">
        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Enrollment & Access
            </h3>
          </div>

          <div>
            <Label>Enrollment Access Type</Label>
            <div className="grid grid-cols-1 gap-3 pt-1">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition ${
                  enrollmentType === 'open'
                    ? 'border-blue-500 bg-blue-50/50 shadow-2xs ring-1 ring-blue-500/20'
                    : 'border-slate-200 bg-slate-50/40 hover:bg-slate-100/70'
                }`}
              >
                <input
                  type="radio"
                  name="enrollment-type"
                  value="open"
                  checked={enrollmentType === 'open'}
                  onChange={() => setEnrollmentType('open')}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-semibold text-slate-900">Open Enrollment</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    Any registered learner can discover and enroll in this course via the course catalog.
                  </p>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition ${
                  enrollmentType === 'invite_only'
                    ? 'border-blue-500 bg-blue-50/50 shadow-2xs ring-1 ring-blue-500/20'
                    : 'border-slate-200 bg-slate-50/40 hover:bg-slate-100/70'
                }`}
              >
                <input
                  type="radio"
                  name="enrollment-type"
                  value="invite_only"
                  checked={enrollmentType === 'invite_only'}
                  onChange={() => setEnrollmentType('invite_only')}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-semibold text-slate-900">Invite Only</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    Access is restricted. Only instructors or admins can manually enroll students into this cohort.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
