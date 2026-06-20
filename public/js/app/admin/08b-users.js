'use strict';

function roleText(role){
  const map={admin:'Admin',manager:'Quản lý',accountant:'Kế toán',warehouse:'Kho',sales:'Bán hàng',delivery:'Giao hàng'};
  return map[role]||role||'';
}
function safeInlineEncodedArg(value){
  return encodeURIComponent(String(value ?? ''));
}
async function loadUsers(){
  try{
    const q=encodeURIComponent(userSearchInput?.value||'');
    const res=await fetch(`/api/users?q=${q}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được tài khoản');
    usersCache=json.users||[];
    window.__usersCache = usersCache;
    try { window.usersCache = usersCache; } catch(e) {}
    renderSalesStaffSelect();
    if(!userTable)return;
    if(userCount)userCount.textContent=`${usersCache.length} tài khoản`;
    if(!usersCache.length){userTable.innerHTML='<tr><td colspan="7">Chưa có tài khoản.</td></tr>';return}
    userTable.innerHTML=usersCache.map(u=>{
      const encodedId=safeInlineEncodedArg(u.id);
      return `<tr>
      <td><strong>${escapeImportHtml(u.code||'')}</strong></td><td>${escapeImportHtml(u.username||'')}</td><td>${escapeImportHtml(u.name||u.fullName||'')}</td><td>${escapeImportHtml(u.phone||'')}</td>
      <td><span class="badge active">${escapeImportHtml(roleText(u.role))}</span></td><td>${u.isActive!==false?'Đang hoạt động':'Ngừng'}</td>
      <td class="row-actions"><button class="small" data-user-action="edit" data-user-id="${encodedId}">Sửa</button><button class="small danger" data-user-action="delete" data-user-id="${encodedId}">Xóa</button></td>
    </tr>`;
    }).join('');
  }catch(err){userTable.innerHTML=`<tr><td colspan="7">${escapeImportHtml(err.message)}</td></tr>`}
}
function resetUserForm(){if(userForm){userForm.reset();userForm.elements.id.value='';userForm.elements.isActive.checked=true} if(userMessage)showMessage(userMessage,'')}
function editUser(id){
  const u=usersCache.find(x=>String(x.id)===String(id)); if(!u||!userForm)return;
  userForm.elements.id.value=u.id||''; userForm.elements.code.value=u.code||''; userForm.elements.username.value=u.username||'';
  userForm.elements.password.value=''; userForm.elements.name.value=u.name||u.fullName||''; userForm.elements.phone.value=u.phone||'';
  userForm.elements.role.value=u.role||'sales'; userForm.elements.isActive.checked=u.isActive!==false;
  document.querySelector('[data-tab="usersTab"]')?.click();
}
async function deleteUser(id){
  if(!confirm('Xóa tài khoản này?'))return;
  try{const res=await fetch(`/api/users/${encodeURIComponent(id)}`,{method:'DELETE'});const json=await res.json();if(!json.ok)throw new Error(json.message);showMessage(userMessage,json.message||'Đã xóa');await loadUsers()}catch(err){showMessage(userMessage,err.message,true)}
}
async function submitUser(event){
  event.preventDefault();
  const body=Object.fromEntries(new FormData(userForm).entries()); body.isActive=userForm.elements.isActive.checked;
  try{const res=await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const json=await res.json();if(!json.ok)throw new Error(json.message);showMessage(userMessage,json.message||'Đã lưu');resetUserForm();await loadUsers()}catch(err){showMessage(userMessage,err.message,true)}
}


// PHASE35_USER_EVENT_OWNERSHIP
if(userForm)userForm.addEventListener('submit',submitUser);
if(resetUserButton)resetUserButton.addEventListener('click',resetUserForm);
if(userSearchInput)userSearchInput.addEventListener('input',debounce(loadUsers,250));

if(userTable&&!userTable.dataset.securityDelegationBound){
  userTable.dataset.securityDelegationBound='1';
  userTable.addEventListener('click',event=>{
    const button=event.target.closest('[data-user-action]');
    if(!button||!userTable.contains(button))return;
    const id=decodeURIComponent(button.dataset.userId||'');
    if(button.dataset.userAction==='edit')editUser(id);
    if(button.dataset.userAction==='delete')deleteUser(id);
  });
}
