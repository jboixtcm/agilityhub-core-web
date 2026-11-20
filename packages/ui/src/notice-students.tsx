/** Links as frozen for the recipient of a class notice. Older notices have no roster. */
export function NoticeStudents({
  students,
}: {
  students: readonly { name: string; href?: string | null }[] | undefined;
}) {
  if (!students?.length) return null;
  return (
    <ul>
      {students.map((student, index) => (
        <li key={index}>
          {student.href ? <a href={student.href}>{student.name}</a> : student.name}
        </li>
      ))}
    </ul>
  );
}
