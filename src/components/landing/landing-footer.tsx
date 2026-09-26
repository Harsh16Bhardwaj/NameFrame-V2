import Image from "next/image";
import Link from "next/link";

const columns = [
  ["Explore", [["Home","/"],["How it works","#workflow"],["Features","#operations"],["Pricing","#answers"]]],
  ["Product", [["Dashboard","/dashboard"],["Create event","/events/new"],["Verify certificates","/verify"],["Templates","/templates"]]],
  ["Resources", [["FAQs","#answers"],["How it works","#workflow"],["Use cases","#stories"],["Support","mailto:support@nameframe.site"]]],
  ["Contact", [["Contact team","/contact"],["Collab hub","/contact"],["Press kit","#answers"]]],
] as const;

export function LandingFooter() {
  return <footer className="reference-footer"><div className="reference-footer-grid"><div className="reference-footer-brand"><Link href="/"><Image src="/nameframe-stitch-logo.png" alt="NameFrame" width={656} height={170}/></Link><p>Made with care for moments worth remembering, from event creation to certificate delivery.</p><div><span>✦ Made with care</span><span>✉ Event ready</span></div></div>{columns.map(([title,links])=><div className="reference-footer-links" key={title}><h3>{title}</h3>{links.map(([label,href])=><Link href={href} key={label}>{label}</Link>)}</div>)}</div><div className="reference-footer-wordmark" aria-hidden="true">NameFrame</div><div className="reference-footer-bottom"><span>© {new Date().getFullYear()} NameFrame Private Limited</span><span>● Privacy · Terms</span><span>V1.0 · All systems operational</span></div></footer>;
}
