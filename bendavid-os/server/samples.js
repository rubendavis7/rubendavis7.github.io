'use strict';
// SAMPLE records: fictional businesses for practice. Every one is stored with
// `sample: true`, shown with a SAMPLE badge, excluded from exports by default,
// never written to the Obsidian vault, and removable in one click.

function iso(base, offsetDays) {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function buildSamples(now) {
  const day = (n) => iso(now, n);
  const clients = [
    {
      key: 'bakery', contactName: 'Maria Lopez (Sample)', businessName: 'Sunrise Bakery (Sample)',
      email: 'maria@example.com', phone: '(555) 010-0101', stage: 'Statements',
      requestedDocs: [
        { name: 'Business bank statements (last 4 months)', received: false, requestedAt: day(-3) },
        { name: 'Signed application', received: true, requestedAt: day(-3), receivedAt: day(-2) },
      ],
      lastContact: day(-3), followUpDate: day(0), nextAction: 'Collect last 4 months of bank statements',
      notes: ['Owner prefers text before calls. Busy mornings.'],
    },
    {
      key: 'auto', contactName: 'Derek Chen (Sample)', businessName: 'Chen Auto Repair (Sample)',
      email: 'derek@example.com', phone: '(555) 010-0102', stage: 'Offer',
      requestedDocs: [
        { name: 'Business bank statements (last 4 months)', received: true, requestedAt: day(-10), receivedAt: day(-8) },
        { name: 'Month-to-date statement', received: false, requestedAt: day(-2) },
      ],
      offer: {
        confirmed: true, funder: 'Example Funder (Sample)', advanceAmount: 50000, paybackAmount: 67500,
        factorRate: 1.35, paymentAmount: 450, paymentFrequency: 'Daily', estimatedTerm: 'About 7 months',
      },
      lastContact: day(-4), followUpDate: day(-1), nextAction: 'Review offer with Derek and get a decision',
      notes: ['Wants funds for a second lift. Comparing two offers.'],
    },
    {
      key: 'landscaping', contactName: 'Tasha Greene (Sample)', businessName: 'Greene Landscaping (Sample)',
      email: 'tasha@example.com', phone: '(555) 010-0103', stage: 'Bank Verification',
      requestedDocs: [{ name: 'Business bank statements (last 4 months)', received: true, requestedAt: day(-14), receivedAt: day(-12) }],
      offer: { confirmed: true, funder: 'Example Funder (Sample)', advanceAmount: 30000, paybackAmount: 39000, factorRate: 1.3, paymentAmount: 975, paymentFrequency: 'Weekly', estimatedTerm: 'About 40 weeks' },
      lastContact: day(-1), followUpDate: day(1), nextAction: 'Confirm bank verification is complete',
      notes: [],
    },
    {
      key: 'logistics', contactName: 'Omar Haddad (Sample)', businessName: 'Haddad Logistics (Sample)',
      email: 'omar@example.com', phone: '(555) 010-0104', stage: 'Funding Call',
      requestedDocs: [{ name: 'Business bank statements (last 4 months)', received: true, requestedAt: day(-20), receivedAt: day(-18) }],
      offer: { confirmed: true, funder: 'Example Funder (Sample)', advanceAmount: 80000, paybackAmount: 104000, factorRate: 1.3, paymentAmount: 2600, paymentFrequency: 'Weekly', estimatedTerm: 'About 40 weeks' },
      lastContact: day(-2), followUpDate: day(0), nextAction: 'Schedule the funding call',
      notes: [],
    },
    {
      key: 'dental', contactName: 'Lisa Park (Sample)', businessName: 'Park Dental Studio (Sample)',
      email: 'lisa@example.com', phone: '(555) 010-0105', stage: 'Funded',
      requestedDocs: [{ name: 'Business bank statements (last 4 months)', received: true, requestedAt: day(-40), receivedAt: day(-38) }],
      offer: { confirmed: true, funder: 'Example Funder (Sample)', advanceAmount: 40000, paybackAmount: 52000, factorRate: 1.3, paymentAmount: 1300, paymentFrequency: 'Weekly', estimatedTerm: 'About 40 weeks' },
      lastContact: day(-6), followUpDate: day(24), nextAction: 'Check in about renewal eligibility',
      notes: [],
    },
  ];
  const tasks = [
    { title: 'Text Maria about missing bank statements (sample)', clientKey: 'bakery', due: day(0) },
    { title: 'Get decision from Derek on the offer (sample)', clientKey: 'auto', due: day(-1) },
    { title: 'Book funding call with Omar (sample)', clientKey: 'logistics', due: day(0) },
    { title: 'Ask Lisa for a referral (sample)', clientKey: 'dental', due: day(3) },
  ];
  return { clients, tasks };
}

module.exports = { buildSamples };
