import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadDashboardPanels} from '../src/lib/dashboardPanels.js';
test('one unavailable dashboard panel does not discard successful data',async()=>{
 const result=await loadDashboardPanels(async url=>{
  if(url.startsWith('/analytics/sales'))throw new Error('Sales temporarily unavailable');
  return url.startsWith('/analytics/financial-kpis')?[]:{total:12};
 },{start:'2026-10-01',end:'2026-10-18',groupBy:'day'});
 assert.equal(result.errors.sales,'Sales temporarily unavailable');
 assert.equal(result.data.sales,undefined);
 assert.deepEqual(result.data.finance,[]);
 assert.equal(result.data.inventory.total,12);
});
test('an unavailable value is not reported as zero or successful empty data',async()=>{
 const result=await loadDashboardPanels(async()=>null);
 assert.equal(Object.keys(result.errors).length,6);
 assert.deepEqual(result.data,{});
});
test('refresh requests carry the selected period, including grouping',async()=>{
 const seen=[];
 await loadDashboardPanels(async url=>{seen.push(url);return url.includes('financial-kpis')?[]:{};},{start:'2026-09-01',end:'2026-09-30',groupBy:'week'});
 assert(seen.some(url=>url.includes('financial-kpis?start=2026-09-01&end=2026-09-30&groupBy=week')));
 assert(seen.some(url=>url==='/analytics/delivery?start=2026-09-01&end=2026-09-30'));
});
