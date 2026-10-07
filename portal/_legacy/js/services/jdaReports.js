import { db } from '../config/firebase.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export async function getReport(jdaId) {
  const snap = await getDoc(doc(db, 'jdaReports', jdaId));
  return snap.exists() ? snap.data() : null;
}
export const saveReport = (jdaId, data) => setDoc(doc(db, 'jdaReports', jdaId), data);
