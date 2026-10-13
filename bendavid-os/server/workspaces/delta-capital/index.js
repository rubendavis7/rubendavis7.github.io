'use strict';
// Delta Capital workspace definition. BenDavid OS is a personal workflow
// system; each project/business is a workspace module like this one. To add a
// project later, create server/workspaces/<id>/ with the same shape and
// register it in server/workspaces/index.js.

const STAGES = ['Statements', 'Offer', 'Accepted', 'Contract', 'Bank Verification', 'Funding Call', 'Funded'];

module.exports = {
  id: 'delta-capital',
  name: 'Delta Capital',
  description: 'Revenue-based funding for business owners: clients, deals, documents, follow-ups.',
  stages: STAGES,
  nearCloseStages: ['Contract', 'Bank Verification', 'Funding Call'],
  closedStage: 'Funded',
  defaultDocs: ['Signed application'],
  defaultStatementMonths: 4,
  // Revenue-based funding is not a loan; its cost is not interest.
  bannedTerms: /\b(loans?|interest|lend(ing|er|ers)?|borrow(ing|ed|er|ers)?|apr|principal)\b/i,
  vault: {
    project: 'projects/delta-capital',
    wiki: 'wiki/delta-capital',
    output: 'output/delta-capital',
    raw: 'raw/delta-capital',
  },
};
