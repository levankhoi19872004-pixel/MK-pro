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
if(userForm)userForm.addEventListener('submit',submitUser);
if(resetUserButton)resetUserButton.addEventListener('click',resetUserForm);
// userSearchInput is owned by app/admin/08b-users.js (debounced); do not bind a second API request here.
if(promotionForm)promotionForm.addEventListener('submit',submitPromotion);
if(resetPromotionButton)resetPromotionButton.addEventListener('click',resetPromotionForm);
if(promotionSearchInput)promotionSearchInput.addEventListener('input',loadPromotions);
if(reloadSystemStatusButton)reloadSystemStatusButton.addEventListener('click',()=>{loadSystemStatus();loadPerformanceBaseline();loadPerformanceObservation();loadApiMonitor();});
if(typeof reloadSystemDataSourceButton!=='undefined'&&reloadSystemDataSourceButton)reloadSystemDataSourceButton.addEventListener('click',loadSystemDataSource);
if(createSystemBackupButton)createSystemBackupButton.addEventListener('click',createSystemBackup);
if(resetSystemDataButton)resetSystemDataButton.addEventListener('click',resetSystemData);
if(reloadApiMonitorButton)reloadApiMonitorButton.addEventListener('click',loadApiMonitor);
if(resetApiMonitorButton)resetApiMonitorButton.addEventListener('click',resetApiMonitorStats);
if(typeof reloadPerformanceBaselineButton!=='undefined'&&reloadPerformanceBaselineButton)reloadPerformanceBaselineButton.addEventListener('click',loadPerformanceBaseline);
if(typeof resetPerformanceBaselineButton!=='undefined'&&resetPerformanceBaselineButton)resetPerformanceBaselineButton.addEventListener('click',resetPerformanceBaselineStats);
if(typeof startPerformanceObservationButton!=='undefined'&&startPerformanceObservationButton)startPerformanceObservationButton.addEventListener('click',startPerformanceObservation);
if(typeof stopPerformanceObservationButton!=='undefined'&&stopPerformanceObservationButton)stopPerformanceObservationButton.addEventListener('click',stopPerformanceObservation);
if(typeof reloadPerformanceObservationButton!=='undefined'&&reloadPerformanceObservationButton)reloadPerformanceObservationButton.addEventListener('click',loadPerformanceObservation);
if(typeof exportPerformanceObservationButton!=='undefined'&&exportPerformanceObservationButton)exportPerformanceObservationButton.addEventListener('click',exportPerformanceObservation);
if(apiMonitorFilter)apiMonitorFilter.addEventListener('change',loadApiMonitor);
if(typeof setupApiMonitorTabs==='function')setupApiMonitorTabs();
if(typeof applyPerformanceObservationRoleUi==='function')applyPerformanceObservationRoleUi();
