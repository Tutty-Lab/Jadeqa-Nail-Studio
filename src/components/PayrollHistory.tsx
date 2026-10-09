import type { Employee } from "../types";
import { isoLabel } from "../lib/shiftOps";

export function PayrollHistory({ employees }: { employees: Employee[] }) {
  const rows = employees.flatMap((employee) => (employee.payrollRecords ?? []).map((record) => ({ employee, ...record })))
    .sort((a, b) => a.month.localeCompare(b.month) || a.employee.id.localeCompare(b.employee.id));
  if (!rows.length) return null;
  return <details className="mt-5 rounded-lg border border-slate-200 p-3" open>
    <summary className="cursor-pointer text-sm font-semibold">Lương và giờ theo từng tháng</summary>
    <p className="my-2 text-xs text-slate-600">
      Giờ quy đổi là định mức xếp ca của đúng tháng ghi dưới đây, thay cho hợp đồng chung.
      Chỉ tạo ca cho nhân viên có dữ liệu trong bảng của tháng đã chọn; hồ sơ và hợp đồng vẫn được giữ cho các tháng khác.
      Ca xếp theo bước 30 phút nên có thể còn chênh lệch; không xếp vào ngày Urlaub hay ngày tiệm đóng cửa.
    </p>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b text-slate-500"><th className="p-2">Tháng</th><th className="p-2">Nhân viên</th><th className="p-2 text-right">Brutto</th><th className="p-2 text-right">Giờ quy đổi</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={`${r.employee.id}/${r.month}`} className="border-b border-slate-100">
          <td className="p-2 whitespace-nowrap">{r.month.slice(5)}/{r.month.slice(0, 4)}</td>
          <td className="p-2">{r.employee.name}</td>
          <td className="p-2 text-right whitespace-nowrap">{r.grossEuro.toLocaleString("de-DE")} €</td>
          <td className="p-2 text-right whitespace-nowrap">{r.convertedHours.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-900">Urlaub là nghỉ phép hưởng lương. Hiện đã chặn xếp ca ngày nghỉ; phần giờ Urlaub được hưởng lương chưa được cộng, cần xác nhận giờ nghỉ phép trước khi dùng tổng thiếu giờ để đối chiếu lương.</p>
    <div className="mt-3 space-y-1 text-xs text-slate-600">
      {employees.flatMap((e) => (e.vacations ?? []).map((v) =>
        <p key={`${e.id}/${v.start}/${v.end}`}>{e.name}: Urlaub {isoLabel(v.start)} – {isoLabel(v.end)} (gồm cả hai ngày).</p>))}
    </div>
  </details>;
}
