// Open and close a <dialog> as a modal, and still show it on phones whose
// browser predates <dialog> (Safari before 15.4): there the element has no
// showModal(), so it is shown with the open attribute and styled by
// [data-fallback] instead of the top layer.
export function openModal(dialog:HTMLDialogElement|undefined|null){
 if(!dialog)return;
 if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal();return;}
 dialog.setAttribute('data-fallback','');
 dialog.setAttribute('open','');
}
export function closeModal(dialog:HTMLDialogElement|undefined|null){
 if(!dialog)return;
 if(typeof dialog.close==='function'&&dialog.open){dialog.close();return;}
 dialog.removeAttribute('open');
}
