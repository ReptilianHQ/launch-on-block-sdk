// Generator helpers; all protocol-specific intent lives in src/indexing.ts.
import assert from 'node:assert/strict';

export function validateMaterializations(catalog) {
  const identifier = value => assert.match(value, /^[A-Za-z][A-Za-z0-9_]*$/);
  for (const contract of catalog.contracts) {
    assert.equal(contract.events.length, contract.eventAbi.length, `Incomplete event coverage ${contract.name}`);
    if (contract.discoveredBy) assert.equal(contract.discoveredBy.startFrom, 'discovery-block');
    for (const event of contract.events) {
      assert.ok(event.description.trim());
      for (const parameter of event.parameters) {
        assert.ok(parameter.semantic.trim());
        if (parameter.semantic.startsWith('raw_')) assert.ok(parameter.asset && parameter.decimalsSource, `Missing amount semantics ${contract.name}.${event.name}.${parameter.name}`);
      }
    }
  }
  for (const entity of catalog.materializations) {
    identifier(entity.name);
    assert.ok(entity.description.trim());
    for (const field of Object.keys(entity.fields)) identifier(field);
    for (const update of entity.updates) {
      const event = catalog.contracts.find(c => c.name === update.contract)?.events.find(e => e.name === update.event);
      assert.ok(event, `Unknown materialization event ${update.event}`);
      assert.equal(event.parameters.find(p => p.name === update.keyParameter)?.type, 'address');
      for (const [field, value] of Object.entries(update.set)) {
        const parameter = 'parameter' in value ? event.parameters.find(p => p.name === value.parameter) : null;
        assert.ok(parameter || value.blockNumber === true, `Unknown parameter ${value.parameter}`);
        const type = value.blockNumber || /^(u?int)/.test(parameter?.type) ? 'BigInt' : 'String';
        assert.equal(entity.fields[field]?.type, type, `Materialization type mismatch ${entity.name}.${field}`);
      }
      for (const [field, definition] of Object.entries(entity.fields)) if (definition.required) assert.ok(update.set[field], `Missing required field ${field}`);
    }
  }
}

export function materializedSchema(catalog) {
  return catalog.materializations.map(entity => `"""${entity.description}"""\ntype ${entity.name} {\n  id: ID!\n${Object.entries(entity.fields).map(([name, field]) => `  ${name}: ${field.type}${field.required ? '!' : ''}`).join('\n')}\n}`).join('\n\n');
}

export function materializedUpdates(catalog, contract, event) {
  const expression = value => {
    if ('blockNumber' in value) return 'BigInt(event.block.number)';
    const type = event.parameters.find(p => p.name === value.parameter).type;
    const expression = `event.params.${value.parameter}`;
    return type === 'address' ? expression + '.toLowerCase()' : /^(u?int)/.test(type) ? `BigInt(${expression})` : expression;
  };
  return catalog.materializations.flatMap(entity => entity.updates.filter(u => u.contract === contract.name && u.event === event.name).map(update => `  {
    const id = \`\${event.chainId}:\${event.params.${update.keyParameter}.toLowerCase()}\`;
    const existing = await context.${entity.name}.get(id);
${Object.entries(update.set).map(([field, value]) => `    if (existing?.${field} != null && existing.${field} !== ${expression(value)}) throw new Error("Conflicting ${entity.name}.${field} evidence");`).join('\n')}
    context.${entity.name}.set({
      id,
${Object.keys(entity.fields).map(field => `      ${field}: ${update.set[field] ? expression(update.set[field]) : `existing?.${field}`},`).join('\n')}
    });
  }`)).join('\n');
}
