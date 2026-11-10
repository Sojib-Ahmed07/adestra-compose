// src/components/tools/age-calculator.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { ageBetween, birthdayAt, formatDateBn, formatDateLong, nextBirthday, parseISODate, todayISO, toISO } from "@/lib/age";
import { toBanglaDigits } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput } from "@/components/ui/form";
import { Card } from "@/components/ui/misc";

export function AgeCalculatorTool() {
  const [dob, setDob] = useState("");
  // Set after load: the server's date can differ from this computer's (time zones).
  const [on, setOn] = useState("");
  useEffect(() => setOn(todayISO()), []);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(30);
  const [useLimit, setUseLimit] = useState(false);

  const birth = parseISODate(dob);
  const onDate = parseISODate(on);

  const result = useMemo(() => {
    if (!birth || !onDate) return null;
    const age = ageBetween(birth, onDate);
    if (!age) return { error: "The “age on” date is before the date of birth." };
    const next = nextBirthday(birth, onDate);
    const daysToNext = Math.round((next - onDate) / 86_400_000);
    const overDate = birthdayAt(birth, maxAge + 1); // the day they become older than the limit
    const minDate = birthdayAt(birth, minAge);
    const exactlyMax = age.years === maxAge && age.months === 0 && age.days === 0;
    const withinMax = age.years < maxAge || exactlyMax;
    const withinMin = age.years >= minAge;
    return { age, next, daysToNext, overDate, minDate, withinMax, withinMin };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dob, on, minAge, maxAge]);

  const a = result?.age;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Card className="h-fit space-y-4 p-5">
        <Field label="Date of birth" htmlFor="age-dob">
          <Input id="age-dob" type="date" value={dob} max={on || undefined} onChange={(e) => setDob(e.target.value)} />
        </Field>
        <Field label="Age on this date" htmlFor="age-on" hint="For a job, use the date written in the circular.">
          <div className="flex gap-2">
            <Input id="age-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
            <Button variant="outline" onClick={() => setOn(todayISO())}>
              Today
            </Button>
          </div>
        </Field>
        <div className="space-y-3 rounded-xl bg-paper p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-ink-800">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-500"
              checked={useLimit}
              onChange={(e) => setUseLimit(e.target.checked)}
            />
            Check an age limit
          </label>
          {useLimit ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minimum age" htmlFor="age-min">
                <NumberInput id="age-min" integer min={0} max={100} value={minAge} onChange={setMinAge} />
              </Field>
              <Field label="Maximum age" htmlFor="age-max">
                <NumberInput id="age-max" integer min={1} max={100} value={maxAge} onChange={setMaxAge} />
              </Field>
            </div>
          ) : null}
        </div>
        {dob || on !== todayISO() ? (
          <Button
            variant="ghost"
            onClick={() => {
              setDob("");
              setOn(todayISO());
            }}
          >
            Clear
          </Button>
        ) : null}
      </Card>

      <div className="min-w-0 space-y-4">
        {!result ? (
          <Card className="p-8 text-center text-sm text-subtle">Enter the date of birth to see the age.</Card>
        ) : result.error ? (
          <Card className="p-5 text-sm text-danger" role="alert">
            {result.error}
          </Card>
        ) : (
          <>
            <Card className="p-5">
              <p className="text-sm text-muted">Age on {formatDateLong(onDate)}</p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {[
                  [a.years, "years", "বছর"],
                  [a.months, "months", "মাস"],
                  [a.days, "days", "দিন"],
                ].map(([n, en, b]) => (
                  <div key={en} className="rounded-xl bg-brand-50 px-3 py-4 text-center">
                    <p className="tabular text-3xl font-semibold text-brand-700 sm:text-4xl">{n}</p>
                    <p className="mt-1 text-xs text-muted">
                      {en} · <span className="font-bangla">{b}</span>
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 font-bangla text-lg text-ink-900">
                {toBanglaDigits(a.years)} বছর {toBanglaDigits(a.months)} মাস {toBanglaDigits(a.days)} দিন
              </p>
              <p className="font-bangla text-sm text-muted">{formatDateBn(onDate)} তারিখে</p>
            </Card>

            {useLimit ? (
              <Card className="space-y-2 p-5">
                <LimitLine
                  ok={result.withinMin}
                  text={
                    result.withinMin
                      ? `At least ${minAge} years old.`
                      : `Under ${minAge}. Turns ${minAge} on ${formatDateLong(result.minDate)}.`
                  }
                />
                <LimitLine
                  ok={result.withinMax}
                  text={
                    result.withinMax
                      ? `Within the ${maxAge}-year limit. Becomes older than ${maxAge} on ${formatDateLong(result.overDate)}.`
                      : `Over the ${maxAge}-year limit by ${a.years - maxAge} year(s) ${a.months} month(s) ${a.days} day(s).`
                  }
                />
                <p className="pt-1 text-xs text-subtle">
                  Some posts allow extra years (e.g. freedom fighter quota or special categories). Check the circular.
                </p>
              </Card>
            ) : null}

            <Card className="grid gap-3 p-5 text-sm sm:grid-cols-3">
              <Fact label="Born" value={formatDateLong(birth)} />
              <Fact label="Total days" value={a.totalDays.toLocaleString("en-IN")} />
              <Fact
                label="Next birthday"
                value={
                  result.daysToNext === 0
                    ? "Today"
                    : `${formatDateLong(result.next)} · in ${result.daysToNext} day${result.daysToNext === 1 ? "" : "s"}`
                }
              />
            </Card>
            <p className="text-xs text-subtle">
              Dates: {toISO(birth)} → {toISO(onDate)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function LimitLine({ ok, text }) {
  return (
    <p className={`flex items-start gap-2 text-sm ${ok ? "text-success" : "text-danger"}`}>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      {text}
    </p>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-medium text-ink-900">{value}</p>
    </div>
  );
}
