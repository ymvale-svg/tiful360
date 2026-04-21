import { forwardRef } from "react";

export interface OffboardingFormAsset {
  asset_id: string;
  asset_name: string;
  asset_code: string;
  category_name?: string | null;
  manufacturer_model?: string | null;
  serial_number?: string | null;
  condition_at_return?: string | null; // 'good' | 'damaged' | 'missing'
  notes?: string | null;
}

export interface OffboardingFormData {
  company_name: string;
  company_logo_url?: string | null;
  employee_name: string;
  employee_id_number?: string | null;
  employee_department: string;
  employee_role?: string | null;
  end_date?: string | null;
  date: string; // ISO of the form
  form_index: number;
  assets: OffboardingFormAsset[];
  receiver_signature?: string | null;
  issuer_signature?: string | null;
}

const conditionLabels: Record<string, string> = {
  good: "תקין",
  damaged: "לא תקין",
  missing: "חסר",
};

interface Props {
  data: OffboardingFormData;
}

export const OffboardingFormView = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const fmt = (d?: string | null) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("he-IL");
    } catch {
      return d;
    }
  };

  return (
    <div
      ref={ref}
      dir="rtl"
      className="bg-white text-black p-10 mx-auto"
      style={{ width: "794px", minHeight: "1123px", fontFamily: "'Arial Hebrew', Arial, sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="w-32 h-20 flex items-center">
          {data.company_logo_url ? (
            <img
              src={data.company_logo_url}
              alt="logo"
              className="max-h-20 max-w-32 object-contain"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="text-sm font-bold">{data.company_name}</div>
          )}
        </div>
        <div className="text-sm text-right">
          <div className="font-bold">בס״ד</div>
          <div className="mt-1">תאריך: {fmt(data.date)}</div>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold underline">
          טופס החזרת ציוד {data.form_index > 1 ? `#${data.form_index}` : ""}
        </h1>
        <div className="text-sm mt-1 text-gray-600">בעת סיום העסקה</div>
      </div>

      {/* Receiver details */}
      <div className="mb-6 text-base leading-relaxed">
        <p className="mb-2">אני הח״מ מאשר/ת בזאת כי החזרתי לחברה את הציוד המפורט מטה:</p>
        <ul className="list-disc pr-6 space-y-1">
          <li><strong>שם מלא:</strong> {data.employee_name}</li>
          {data.employee_id_number && <li><strong>ת״ז:</strong> {data.employee_id_number}</li>}
          <li><strong>מחלקה / יחידה:</strong> {data.employee_department}</li>
          {data.employee_role && <li><strong>תפקיד:</strong> {data.employee_role}</li>}
          {data.end_date && <li><strong>תאריך סיום עבודה:</strong> {fmt(data.end_date)}</li>}
        </ul>
      </div>

      {/* Equipment table */}
      <table className="w-full border-collapse mb-8 text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 p-2 text-right">תיאור הפריט</th>
            <th className="border border-gray-400 p-2 text-right">יצרן ומודל</th>
            <th className="border border-gray-400 p-2 text-right">מס׳ סידורי</th>
            <th className="border border-gray-400 p-2 text-right">מצב בעת ההחזרה</th>
            <th className="border border-gray-400 p-2 text-right">הערות</th>
          </tr>
        </thead>
        <tbody>
          {data.assets.map((a) => (
            <tr key={a.asset_id}>
              <td className="border border-gray-400 p-2">
                {a.asset_name}
                {a.category_name && (
                  <div className="text-xs text-gray-500">{a.category_name}</div>
                )}
                <div className="text-xs font-mono text-gray-500" dir="ltr">{a.asset_code}</div>
              </td>
              <td className="border border-gray-400 p-2">{a.manufacturer_model || "—"}</td>
              <td className="border border-gray-400 p-2 font-mono" dir="ltr">{a.serial_number || "—"}</td>
              <td className="border border-gray-400 p-2">
                {conditionLabels[a.condition_at_return ?? "good"] ?? "—"}
              </td>
              <td className="border border-gray-400 p-2">{a.notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Declaration */}
      <div className="mb-8 text-sm leading-relaxed">
        <h2 className="font-bold text-base mb-3 underline">הצהרה:</h2>
        <ol className="list-decimal pr-6 space-y-2">
          <li>אני מאשר/ת שהחזרתי את כל הציוד המפורט בטופס זה לחברה.</li>
          <li>המצב המתואר בעמודת "מצב בעת ההחזרה" משקף את מצב הציוד בעת מסירתו.</li>
          <li>ידוע לי כי במקרה של ציוד חסר או פגום עקב רשלנות, החברה רשאית לפעול בהתאם למדיניותה.</li>
          <li>אני מאשר/ת כי מחקתי כל מידע אישי מהמכשירים שהוחזרו.</li>
        </ol>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-8 mt-12">
        <div className="text-center">
          <div className="text-sm font-medium mb-2">אישור מקבל הציוד (מחסן/מחשוב)</div>
          <div className="h-24 border-b border-gray-400 flex items-end justify-center pb-1">
            {data.issuer_signature && (
              <img src={data.issuer_signature} alt="issuer" className="max-h-20 object-contain" />
            )}
          </div>
          <div className="text-xs mt-1">חתימה</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-medium mb-2">חתימת המחזיר</div>
          <div className="h-24 border-b border-gray-400 flex items-end justify-center pb-1">
            {data.receiver_signature && (
              <img src={data.receiver_signature} alt="receiver" className="max-h-20 object-contain" />
            )}
          </div>
          <div className="text-xs mt-1">{data.employee_name}</div>
        </div>
      </div>
    </div>
  );
});
OffboardingFormView.displayName = "OffboardingFormView";
