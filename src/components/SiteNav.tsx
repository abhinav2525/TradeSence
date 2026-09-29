import Link from "next/link";

type Props = { current: "breadth" | "crossings"; ma: string };

export default function SiteNav({ current, ma }: Props) {
  return (
    <nav className="sitenav" aria-label="Sections">
      <Link href={`/?ma=${ma}`} aria-current={current === "breadth" ? "page" : undefined}>
        Breadth
      </Link>
      <Link href={`/crossings?ma=${ma}`} aria-current={current === "crossings" ? "page" : undefined}>
        Crossings
      </Link>
    </nav>
  );
}
