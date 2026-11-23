// Csalás védekezés-tár (2026-11-23; terv: docs/superpowers/plans/2026-11-21-csalas-figyelo.md 3. rész,
// spec: docs/superpowers/specs/2026-11-21-csalas-figyelo-design.md 8.3).
//
// Csatornánként 3–6 védekezési lépés, mindegyik mellett a hivatalos oldal, AHOL SZÓ SZERINT (vagy hű átírással)
// szerepel. A csalás-hír „How to protect yourself” fejezete CSAK a csalás saját forrásából vagy ebből a tárból
// vehet lépést; ha egyikben sincs, nincs csalás-hír.
//
// KÉZI TÁR: minden tétel 2026-11-23-án elolvasott hivatalos oldalból jött (FTC consumer advice, FTC Data Spotlight,
// FBI IC3 PSA). Kitalált lépés TILOS, ár nem lehet benne (core/ar-tilalom.js). Új tétel = forrás-URL + a teszt
// (core/csalas-vedekezes.test.js) — ugyanúgy, mint a core/ismert-tevedesek.js-nél.
// A CISA „Recognize and Report Phishing” oldalát szándékosan NEM használjuk: 11-23-án „Archived Content”
// jelölést visel (elavult lehet).

const F = {
  sms: 'https://consumer.ftc.gov/articles/how-recognize-and-report-spam-text-messages',
  phishing: 'https://consumer.ftc.gov/articles/how-recognize-and-avoid-phishing-scams',
  telefon: 'https://consumer.ftc.gov/articles/phone-scams',
  altalanos: 'https://consumer.ftc.gov/articles/how-avoid-scam',
  veszhelyzet: 'https://consumer.ftc.gov/articles/scammers-use-fake-emergencies-steal-your-money',
  ic3Ai: 'https://www.ic3.gov/PSA/2024/PSA241203',
  kozossegi: 'https://www.ftc.gov/news-events/data-visualizations/data-spotlight/2023/10/social-media-golden-goose-scammers',
  kozossegiBefektetes: 'https://consumer.ftc.gov/consumer-alerts/2026/11/veterans-day-reminder-how-spot-scams-social-media',
  vasarlas: 'https://consumer.ftc.gov/articles/online-shopping',
  techSupport: 'https://consumer.ftc.gov/articles/how-spot-avoid-and-report-tech-support-scams',
  atvertek: 'https://consumer.ftc.gov/articles/what-do-if-you-were-scammed',
};

const l = (lepes, forras) => Object.freeze({ lepes, forras });

export const VEDEKEZES = Object.freeze({
  sms: Object.freeze([
    l("Don't click links in a text you didn't expect. Legitimate companies won't ask for information about your account by text.", F.sms),
    l('Contact the company using a phone number or website you know is real — not the information in the text message.', F.sms),
    l('Copy the message and forward it to 7726 (SPAM).', F.sms),
    l('Check whether your phone or wireless provider offers a way to filter and block spam texts or messages from unknown senders.', F.sms),
  ]),
  email: Object.freeze([
    l("Don't click links in an email you didn't expect — it's best not to click on any links.", F.altalanos),
    l('Contact the company using a phone number or website you know is real — not the information in the email.', F.phishing),
    l('Forward phishing emails to the Anti-Phishing Working Group at reportphishing@apwg.org.', F.phishing),
    l('Protect your accounts by using multi-factor authentication.', F.phishing),
    l('Set your security software and your phone to update automatically.', F.phishing),
    l('If you think a scammer has your Social Security, credit card, or bank account number, go to IdentityTheft.gov.', F.phishing),
  ]),
  call: Object.freeze([
    l("Hang up — or tell the person you'll call them right back.", F.veszhelyzet),
    l("Don't trust caller ID: scammers can make any name or number show up on it.", F.telefon),
    l("Don't call a number they gave you or the number from your caller ID. Contact them using a website you know is trustworthy.", F.altalanos),
    l('No government agency will call you out of the blue and ask for sensitive information.', F.telefon),
    l('Anyone who insists that you can only pay by wire transfer, gift card, cryptocurrency, or payment app is a scammer.', F.telefon),
    l('Use call blocking — it is your best defense against unwanted calls.', F.telefon),
  ]),
  chat: Object.freeze([
    l("If a friend or family member messages you about an emergency, contact them using a phone number you know is right and ask if they're really in trouble.", F.veszhelyzet),
    l('Create a secret word or phrase with your family to verify their identity.', F.ic3Ai),
    l('Never share sensitive information with people you have met only online or over the phone.', F.ic3Ai),
    l("Don't send money, gift cards, or cryptocurrency to people you don't know or have met only online or over the phone.", F.ic3Ai),
    l('Resist the pressure to act immediately. Stop and talk to someone you trust.', F.altalanos),
  ]),
  social: Object.freeze([
    l('Limit who can see your posts and information on social media — visit your privacy settings to set some restrictions.', F.kozossegi),
    l('If you get a message from a friend about an opportunity or an urgent need for money, call them. Their account may have been hacked.', F.kozossegi),
    l("If someone rushes you to start a friendship or romance, slow down — and never send money to someone you haven't met in person.", F.kozossegi),
    l("Before you buy, check out the company: search online for its name plus 'scam' or 'complaint.'", F.kozossegi),
    l('Never let someone you met on social media direct your investment decisions.', F.kozossegiBefektetes),
  ]),
  web: Object.freeze([
    l('Real security pop-up warnings and messages will never ask you to call a phone number.', F.techSupport),
    l('Do not use the number included in the message — contact the company directly using a phone number you know is real.', F.techSupport),
    l("Before you buy, search online for the product or company name plus the words 'complaint' or 'scam.'", F.vasarlas),
    l('Pay by credit card — it best protects you and your money in case of a scam.', F.vasarlas),
    l('Never buy anything from online sellers that insist you can only pay with gift cards.', F.vasarlas),
    l('If you gave your username and password to a scammer, change your password right away.', F.techSupport),
  ]),
});

export function vedekezesCsatornara(csatorna) {
  const tar = Object.hasOwn(VEDEKEZES, String(csatorna)) ? VEDEKEZES[csatorna] : null;
  return tar ? [...tar] : [];
}

// „If it already happened”: hova jelentsd (USA) + országfüggetlen mondat + a pénz visszakérése.
export const BEJELENTES = Object.freeze([
  Object.freeze({ nev: "FBI's Internet Crime Complaint Center (IC3)", url: 'https://www.ic3.gov' }),
  Object.freeze({ nev: 'FTC — ReportFraud.ftc.gov', url: 'https://reportfraud.ftc.gov' }),
]);

export const ORSZAGFUGGETLEN = 'Outside the US, contact your local police or consumer protection agency.';

export const PENZ_VISSZA = l(
  'If you paid, report it right away to your bank, card issuer, or the company you used to send the money, and ask them to reverse the payment.',
  F.atvertek,
);
