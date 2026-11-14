import type {IndustrialGraph} from "../../../engine/src/studio/industrial";
export type Scenario="manufacturing"|"energy"|"computing";
export const SCENARIOS:Record<Scenario,IndustrialGraph>={
 manufacturing:{
  name:"Manufacturing conflict separation · synthetic",
  context:"Illustrative conflict pairs between activities. No real production constraints, throughput, safety or capacity data.",
  nodes:["Cutting","Welding","Coating","Assembly","Inspection","Packaging"],
  edges:[
   {source:0,target:1,weight:7},{source:0,target:2,weight:4},
   {source:1,target:3,weight:6},{source:1,target:4,weight:9},
   {source:2,target:4,weight:5},{source:2,target:5,weight:3},
   {source:3,target:5,weight:4},{source:4,target:5,weight:7}
  ]
 },
 energy:{
  name:"Energy interaction partition · synthetic",
  context:"Illustrative weighted network segmentation. No electrical power-flow, N-1 reliability or dispatch constraints.",
  nodes:["Substation A","Substation B","Node C","Node D","Node E","Node F","Node G","Node H"],
  edges:[
   {source:0,target:1,weight:4},{source:0,target:2,weight:8},{source:1,target:3,weight:5},
   {source:1,target:4,weight:6},{source:2,target:5,weight:9},{source:2,target:6,weight:3},
   {source:3,target:7,weight:7},{source:4,target:6,weight:8},{source:5,target:7,weight:6},
   {source:6,target:7,weight:5}
  ]
 },
 computing:{
  name:"Compute-job interference separation · synthetic",
  context:"Illustrative conflict graph. Does not include memory, machine placement, capacity or dependency constraints.",
  nodes:["Job A","Job B","Job C","Job D","Job E","Job F","Job G","Job H"],
  edges:[
   {source:0,target:1,weight:9},{source:0,target:4,weight:4},{source:1,target:2,weight:6},
   {source:1,target:5,weight:7},{source:2,target:3,weight:8},{source:2,target:6,weight:5},
   {source:3,target:4,weight:4},{source:3,target:7,weight:7},{source:4,target:5,weight:5},
   {source:5,target:6,weight:8},{source:6,target:7,weight:6}
  ]
 }
};
