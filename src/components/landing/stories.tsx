const stories = [
  ["We used this for our community event certificates and the process was flawless. It saved hours of manual work.", "Rohit Goel", "Community lead"],
  ["I needed certificates for a hackathon. No whole flow took minutes, not days. The participant delivery tracking is precise.", "Aryan Chauhan", "Technical lead"],
  ["Our society needed a way to recognize members with certificates. NameFrame made it simple and the typography looks handcrafted.", "Anya Singh", "Society organizer"],
  ["Managing event logistics is already a lot. Automating certificates was a massive win for our operations team.", "Vikas Gupta", "Event operations"],
  ["I create custom designs and use NameFrame to handle the repetitive certificate work. Zero issues with formatting.", "Sarthak Agarwal", "Graphic designer"],
] as const;

export function Stories() {
  return <section className="reference-section reference-stories" id="stories"><div className="reference-section-heading"><p>Loved by event teams</p><h2>Certificates that people <em>actually remember.</em></h2><span>From hackathons to college societies, teams use NameFrame to send polished certificates without getting buried in manual work.</span></div><div className="reference-story-grid">{stories.map(([quote,name,role])=><article key={name}><div className="reference-stars">★★★★★</div><p>“{quote}”</p><footer><span>{name.split(" ").map(part=>part[0]).join("")}</span><div><b>{name}</b><small>{role}</small></div></footer></article>)}<article className="reference-story-callout"><small>Community standard</small><h3>Built for people who care about craft.</h3><p>A deliberate certificate workflow for institutions, societies, workshops, and community events.</p><a href="#answers">Read organizer stories →</a></article></div></section>;
}
