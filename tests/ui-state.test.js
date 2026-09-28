import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults, readState, stateURL} from '../src/ui-state.js';
const books=[{title:'Berakhot',order:'Zeraim',chapters:Array(9)},{title:'Shabbat',order:'Moed',chapters:Array(24)}];
test('Bookmarked reader state round-trips Hebrew phrases, filters, chapter, and pagination',()=>{
 const state={...defaults,view:'reader',order:'Zeraim',tractate:'Berakhot',text:'רַבִּי אומר',chapter:2,page:1};
 assert.deepEqual(readState(stateURL(state),books),state);
});
test('Word and reader searches remain independent when changing views',()=>{
 const state={...defaults,view:'words',word:'טהור',text:'רבי אומר',mode:'rare',hide:true,sort:'unique'};
 assert.deepEqual(readState(stateURL(state),books),state);
 assert.deepEqual(readState(stateURL({...state,view:'reader'}),books),{...state,view:'reader'});
});
test('Invalid URL filters, chapters, and pagination recover to usable defaults',()=>{
 const s=readState('?view=missing&order=Moed&tractate=Berakhot&chapter=99&page=-1&mode=bad&sort=bad',books);
 assert.deepEqual(s,{...defaults,order:'Moed'});
 assert.equal(readState('?tractate=Berakhot&chapter=10',books).chapter,0);
 assert.equal(readState('?tractate=Berakhot&chapter=2.5',books).chapter,0);
 assert.equal(readState('?page=Infinity',books).page,100000);
 assert.equal(stateURL(defaults),'/');
});
