import { forwardRef } from "react";

export interface HandoverFormData {
  company_name: string;
  company_logo_url?: string | null;
  employee_name: string;
  employee_department: string;
  date: string; // ISO or formatted
  asset_name: string;
  category_name?: string | null;
  manufacturer_model?: string | null;
  asset_code: string;
  condition: string; // 'new' | 'good' | 'fair'
  issuer_signature?: string | null;
  receiver_signature?: string | null;
}

const conditionLabels: Record<string, string> = {
  new: "חדש",
  good: "תקין",
  fair: "בינוני",
};

interface Props {
  data: HandoverFormData;
}

export const HandoverFormView = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const dateText = (() => {
    try {
      return new Date(data.date).toLocaleDateString("he-IL");
    } catch {
      return data.date;
    }
  })();

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
          <div className="mt-1">תאריך: {dateText}</div>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold underline">הצהרת קבלת ציוד</h1>
      </div>

      {/* Receiver details */}
      <div className="mb-6 text-base leading-relaxed">
        <p className="mb-2">אני הח״מ מאשר/ת בזאת כי קיבלתי לרשותי את הציוד המפורט מטה:</p>
        <ul className="list-disc pr-6 space-y-1">
          <li><strong>שם מלא:</strong> {data.employee_name}</li>
          <li><strong>מחלקה / יחידה:</strong> {data.employee_department}</li>
          <li><strong>תאריך משיכה:</strong> {dateText}</li>
        </ul>
      </div>

      {/* Equipment table */}
      <table className="w-full border-collapse mb-8 text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 p-2 text-right">תיאור הפריט</th>
            <th className="border border-gray-400 p-2 text-right">יצרן ומודל</th>
            <th className="border border-gray-400 p-2 text-right">מס׳ סידורי</th>
            <th className="border border-gray-400 p-2 text-right">מצב הציוד</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-400 p-2">{data.category_name || data.asset_name}</td>
            <td className="border border-gray-400 p-2">{data.manufacturer_model || data.asset_name || "—"}</td>
            <td className="border border-gray-400 p-2 font-mono" dir="ltr">{data.asset_code}</td>
            <td className="border border-gray-400 p-2">{conditionLabels[data.condition] ?? data.condition}</td>
          </tr>
        </tbody>
      </table>

      {/* Declaration */}
      <div className="mb-8 text-sm leading-relaxed">
        <h2 className="font-bold text-base mb-3 underline">הצהרה והתחייבות:</h2>
        <ol className="list-decimal pr-6 space-y-2">
          <li>
            אני מתחייב/ת לשמור על הציוד שקיבלתי, לעשות בו שימוש סביר ובהתאם לייעודו, ולהחזירו במצב תקין לחברה
            עם סיום העסקתי או על פי דרישתה.
          </li>
          <li>
            ידוע לי כי הציוד הינו רכוש החברה בלבד, וכי אינני רשאי/ת להעבירו לאחר, להשאילו, למוכרו או לעשות בו
            שימוש למטרות שאינן קשורות לעבודתי.
          </li>
          <li>
            במקרה של נזק, אובדן או גניבה — מתחייב/ת לדווח באופן מיידי לגורם המנפק, ולשאת באחריות בהתאם
            למדיניות החברה.
          </li>
          <li>
            ידוע לי כי החברה רשאית לקזז משכרי או מכל סכום אחר המגיע לי, את עלות הציוד שלא הוחזר או שניזוק
            עקב רשלנות או שימוש לא סביר.
          </li>
        </ol>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-8 mt-12">
        <div className="text-center">
          <div className="text-sm font-medium mb-2">אישור גורם מנפק (מחסן/מחשוב)</div>
          <div className="h-24 border-b border-gray-400 flex items-end justify-center pb-1">
            {data.issuer_signature && (
              <img src={data.issuer_signature} alt="issuer" className="max-h-20 object-contain" />
            )}
          </div>
          <div className="text-xs mt-1">חתימה</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-medium mb-2">חתימת המושך</div>
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
HandoverFormView.displayName = "HandoverFormView";
