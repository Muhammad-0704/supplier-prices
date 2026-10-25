'use client';
import { setRole } from './team-actions';

/** Роль сохраняется сразу при выборе, без отдельной кнопки. */
export function RoleSelect({ id, role }: { id: string; role: string }) {
  return (
    <form action={setRole}>
      <input type="hidden" name="id" value={id} />
      <select className="select" name="role" defaultValue={role} aria-label="Роль" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        <option value="staff">Сотрудник</option>
        <option value="manager">Руководитель</option>
      </select>
    </form>
  );
}
