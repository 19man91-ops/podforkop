'use strict';
'require baseclass';
'require fs';
'require uci';
'require ui';
'require rpc';

if (typeof structuredClone !== 'function')
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));

export * from './validators';
export * from './helpers';
export * from './podkop';
export * from './constants';
