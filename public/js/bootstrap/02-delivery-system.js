'use strict';

if(reloadDeliveryTodayButton)reloadDeliveryTodayButton.addEventListener('click',loadDeliveryToday);
if(deliveryDateFilter){if(!deliveryDateFilter.value)deliveryDateFilter.value=today();deliveryDateFilter.addEventListener('change',loadDeliveryToday);}
if(deliverySearchInput)deliverySearchInput.addEventListener('input',loadDeliveryToday);
if(deliverySalesmanFilter)deliverySalesmanFilter.addEventListener('input',loadDeliveryToday);
if(deliveryStaffFilter)deliveryStaffFilter.addEventListener('input',loadDeliveryToday);
if(deliveryRouteFilter)deliveryRouteFilter.addEventListener('input',loadDeliveryToday);
if(deliveryStatusFilter)deliveryStatusFilter.addEventListener('change',loadDeliveryToday);
if(deliveryEditForm)deliveryEditForm.addEventListener('submit',submitDeliveryEdit);
if(deliveryEditResetButton)deliveryEditResetButton.addEventListener('click',clearDeliveryEditPanel);
[deliveryEditDebtBefore,deliveryEditCash,deliveryEditBank,deliveryEditReturn].filter(Boolean).forEach(input=>input.addEventListener('input',recalcDeliveryEditDebt));
if(reloadReportsButton)reloadReportsButton.addEventListener('click',loadReports);
if(reportFromDate)reportFromDate.addEventListener('change',loadReports);
if(reportToDate)reportToDate.addEventListener('change',loadReports);
if(userForm)userForm.addEventListener('submit',submitUser);
if(resetUserButton)resetUserButton.addEventListener('click',resetUserForm);
if(userSearchInput)userSearchInput.addEventListener('input',loadUsers);
if(promotionForm)promotionForm.addEventListener('submit',submitPromotion);
if(resetPromotionButton)resetPromotionButton.addEventListener('click',resetPromotionForm);
if(promotionSearchInput)promotionSearchInput.addEventListener('input',loadPromotions);
if(reloadSystemStatusButton)reloadSystemStatusButton.addEventListener('click',()=>{loadSystemStatus();loadApiMonitor();});
if(typeof reloadSystemDataSourceButton!=='undefined'&&reloadSystemDataSourceButton)reloadSystemDataSourceButton.addEventListener('click',loadSystemDataSource);
if(createSystemBackupButton)createSystemBackupButton.addEventListener('click',createSystemBackup);
if(resetSystemDataButton)resetSystemDataButton.addEventListener('click',resetSystemData);
if(reloadApiMonitorButton)reloadApiMonitorButton.addEventListener('click',loadApiMonitor);
if(resetApiMonitorButton)resetApiMonitorButton.addEventListener('click',resetApiMonitorStats);
if(apiMonitorFilter)apiMonitorFilter.addEventListener('change',loadApiMonitor);
if(typeof setupApiMonitorTabs==='function')setupApiMonitorTabs();

