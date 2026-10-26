// Who the approval-request email from the Microsoft List goes to, per JDA (the Project Lead, and anyone
// copied), and who signs it. Left blank for now: the draft opens in Outlook with To and Cc empty and
// "[Project Lead]" / "[Your name]" in the text, to fill in there. Comma-separate several addresses.
export const RECIPIENTS = {
  'JDA 1': { to: '', cc: '', greeting: '' },
  'JDA 2': { to: '', cc: '', greeting: '' },
  'JDA 3': { to: '', cc: '', greeting: '' }
};
export const SIGN_OFF = '';
export const recipientsFor = jdaName => RECIPIENTS[jdaName] || { to: '', cc: '', greeting: '' };
