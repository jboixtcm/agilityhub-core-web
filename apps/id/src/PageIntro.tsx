export function PageIntro({ description, title }: { description: string; title: string }) {
  return (
    <div className="id-page__intro">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
