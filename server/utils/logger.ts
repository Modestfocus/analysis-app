export type LogCtx = { requestId?: string; tag?: string };

const ts = () => new Date().toISOString();

export const log = (msg: string, ctx: LogCtx = {}) => {
  const { requestId, tag } = ctx;
  const head = `[${ts()}]${tag ? " [" + tag + "]" : ""}${requestId ? " (" + requestId + ")" : ""}`;
  console.log(head, msg);
};

export const logErr = (err: unknown, ctx: LogCtx = {}) => {
  const { requestId, tag } = ctx;
  const head = `[${ts()}]${tag ? " [" + tag + "]" : ""}${requestId ? " (" + requestId + ")" : ""}`;
  console.error(
    head,
    err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : err
  );
};
