/**
 * Локальный сервер, который притворяется 1С:Фреш OData с демо-данными.
 * Запуск: npm run mock:odata → http://localhost:8181/odata/standard.odata
 * Можно поставить ONEC_MODE=odata и ONEC_ODATA_URL на этот адрес, чтобы проверить настоящий путь запросов.
 */
import { createServer } from 'node:http';
import { mockFetcher } from '../src/lib/onec/mock';

const PORT = Number(process.env.PORT || 8181);

createServer(async (req, res) => {
  const url = `http://localhost:${PORT}${req.url}`;
  const r = await mockFetcher(url);
  res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(await r.text());
}).listen(PORT, () => console.log(`Демо-OData 1С: http://localhost:${PORT}/odata/standard.odata`));
