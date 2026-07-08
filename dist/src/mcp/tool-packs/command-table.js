import { defineTool } from './contracts.js';
function project(kind, toHandler) {
    return { kind, toHandler };
}
function withHandlerContext(handler) {
    return project('handler-context', handler);
}
function withRequiredProjectRoot(handler) {
    return project('required-project-root', (args, ctx) => handler(args, ctx.projectRoot));
}
function withOptionalProjectRoot(handler) {
    return project('optional-project-root', (args, ctx) => handler(args, ctx.projectRoot));
}
function withArgsOnly(handler) {
    return project('args-only', (args) => handler(args));
}
function withPostCall(handler, onPostCall) {
    return { ...handler, onPostCall };
}
function defineCommandTable(schemas, commands) {
    const schemaKeys = Object.keys(schemas).sort();
    const commandKeys = Object.keys(commands).sort();
    if (schemaKeys.length !== commandKeys.length || schemaKeys.some((key, index) => key !== commandKeys[index])) {
        throw new Error(`Command table keys must match schema keys. Schemas: ${schemaKeys.join(', ')}; commands: ${commandKeys.join(', ')}`);
    }
    for (const name of commandKeys) {
        const command = commands[name];
        if (command.handler.kind === 'required-project-root' && command.requiresWorkspace !== true) {
            throw new Error(`Command "${name}" uses required project root projection and must set requiresWorkspace: true.`);
        }
    }
    return commands;
}
function registerCommandTable(schemas, commands, options) {
    defineCommandTable(schemas, commands);
    for (const name of Object.keys(schemas)) {
        const schema = schemas[name];
        const command = commands[name];
        if (!schema || !command) {
            throw new Error(`Missing command declaration for "${name}".`);
        }
        const definition = {
            ...options,
            name,
            schema,
            handler: command.handler.toHandler,
            requiresWorkspace: command.requiresWorkspace === true,
            onPostCall: command.onPostCall ?? command.handler.onPostCall,
        };
        defineTool(command.description === undefined
            ? definition
            : { ...definition, description: command.description });
    }
}
export { defineCommandTable, registerCommandTable, withArgsOnly, withHandlerContext, withOptionalProjectRoot, withPostCall, withRequiredProjectRoot, };
