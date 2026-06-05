"use client";

import { useState } from "react";
import type { CommonData } from "@/types/common";

interface CommonDataFormProps {
  commonData: CommonData;
  onChange: (next: CommonData) => void;
}

type Field = {
  key: keyof CommonData;
  label: string;
  placeholder: string;
};

const FIELDS: Field[] = [
  { key: "customerName",      label: "Заказчик (наименование)",   placeholder: "ТОО «Наименование организации»" },
  { key: "customerAddress",   label: "Адрес заказчика",           placeholder: "г. Алматы, ул. ..." },
  { key: "organizationName",  label: "Наименование лаборатории",  placeholder: "ТОО «Лаборатория»" },
  { key: "protocolDate",      label: "Дата протокола",            placeholder: "10 апреля 2026 г." },
  { key: "performerFullName", label: "Исполнитель (ФИО)",         placeholder: "Иванов И.И." },
  { key: "performerPosition", label: "Должность исполнителя",     placeholder: "Заведующий лабораторией" },
  { key: "approvalFullName",  label: "Утверждающий (ФИО)",        placeholder: "Петров П.П." },
  { key: "approvalPosition",  label: "Должность утверждающего",   placeholder: "Директор" },
];

export function CommonDataForm({ commonData, onChange }: CommonDataFormProps) {
  const [open, setOpen] = useState(false);

  const hasAnyValue = Object.values(commonData).some((v) => v !== "");

  function set(key: keyof CommonData, value: string) {
    onChange({ ...commonData, [key]: value });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Общие данные для протоколов
          </span>
          {hasAnyValue && !open && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              заполнены
            </span>
          )}
        </span>
        <span className="text-xs text-slate-400">{open ? "Свернуть ▲" : "Развернуть ▼"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <p className="mb-3 text-xs text-slate-500">
            Значения ниже автоматически подставляются во все протоколы.
            Если конкретный протокол уже содержит своё значение — оно имеет приоритет.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(({ key, label, placeholder }) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">{label}</span>
                <input
                  type="text"
                  value={commonData[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={placeholder}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
