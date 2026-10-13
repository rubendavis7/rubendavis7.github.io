'use strict';
// SAMPLE records: fictional businesses for practice. Every one is stored with
// `sample: true`, shown with a SAMPLE badge, excluded from exports and from
// wiki/daily notes, and labelled SAMPLE wherever it appears in output/.
// Removable in one click.

const { addDays, monthsBefore } = require('../../time');

function buildSamples(today) {
  const day = (n) => addDays(today, n);
  const months = monthsBefore(today, 4);
  const monthDocs = (receivedCount, requestedAt, receivedAt) => months.map((month, i) => ({
    kind: 'bank-statement', month, received: i < receivedCount, requestedAt, receivedAt: i < receivedCount ? receivedAt : '',
  }));
  const clients = [
    {
      key: 'bakery', contactName: 'Maria Lopez (Sample)', businessName: 'Sunrise Bakery (Sample)',
      email: 'maria@example.com', phone: '(555) 010-0101', stage: 'Statements',
      requestedDocs: [
        ...monthDocs(1, day(-3), day(-2)),
        { name: 'Signed application', received: true, requestedAt: day(-3), receivedAt: day(-2) },
      ],
      lastContact: day(-3), followUpDate: day(0), nextAction: 'Collect the missing bank statements',
      notes: ['Owner prefers text before calls. Busy mornings.'],
    },
    {
      key: 'auto', contactName: 'Derek Chen (Sample)', businessName: 'Chen Auto Repair (Sample)',
      email: 'derek@example.com', phone: '(555) 010-0102', stage: 'Offer',
      requestedDocs: [
        ...monthDocs(4, day(-10), day(-8)),
        { name: 'Month-to-date statement', kind: 'bank-statement', received: false, requestedAt: day(-2) },
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
      requestedDocs: monthDocs(4, day(-14), day(-12)),
      offer: { confirmed: true, funder: 'Example Funder (Sample)', advanceAmount: 30000, paybackAmount: 39000, factorRate: 1.3, paymentAmount: 975, paymentFrequency: 'Weekly', estimatedTerm: 'About 40 weeks' },
      lastContact: day(-1), followUpDate: day(1), nextAction: 'Confirm bank verification is complete',
      notes: [],
    },
    {
      key: 'logistics', contactName: 'Omar Haddad (Sample)', businessName: 'Haddad Logistics (Sample)',
      email: 'omar@example.com', phone: '(555) 010-0104', stage: 'Funding Call',
      requestedDocs: monthDocs(4, day(-20), day(-18)),
      offer: { confirmed: true, funder: 'Example Funder (Sample)', advanceAmount: 80000, paybackAmount: 104000, factorRate: 1.3, paymentAmount: 2600, paymentFrequency: 'Weekly', estimatedTerm: 'About 40 weeks' },
      lastContact: day(-2), followUpDate: day(0), nextAction: 'Schedule the funding call',
      notes: [],
    },
    {
      key: 'dental', contactName: 'Lisa Park (Sample)', businessName: 'Park Dental Studio (Sample)',
      email: 'lisa@example.com', phone: '(555) 010-0105', stage: 'Funded',
      requestedDocs: monthDocs(4, day(-40), day(-38)),
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
