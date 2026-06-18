import type { ValidationIssue } from "@/lib/docs/zod-helpers";

interface Props {
  title: string;
  issues: ValidationIssue[] | string[];
}

export function ValidationErrors({ title, issues }: Props) {
  if (issues.length === 0) return null;
  return (
    <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      <div className="mb-1 font-semibold">{title}</div>
      <ul className="list-disc pl-5">
        {issues.map((issue, i) => {
          const text =
            typeof issue === "string"
              ? issue
              : issue.path
                ? `${issue.path}: ${issue.message}`
                : issue.message;
          return <li key={i}>{text}</li>;
        })}
      </ul>
    </div>
  );
}
