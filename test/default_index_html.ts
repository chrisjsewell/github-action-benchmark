import { strict as A } from 'assert';
import * as cheerio from 'cheerio';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Parser as JsParser } from 'acorn';

describe('check assets', function() {
    it('default_index.html is valid HTML', async function() {
        // Verify HTML syntax
        const html = await fs.readFile(join(__dirname, '../src/assets/default_index.html'), 'utf8');
        const q = cheerio.load(html);
        const s = q('#main-script');
        A.ok(s, 'main script');
    });
    it('main.js is valid Javascript', async function() {
        // Verify HTML syntax
        const js = await fs.readFile(join(__dirname, '../src/assets/main.js'), 'utf8');
        // Verify JavaScript syntax. It raises an error if invalid
        JsParser.parse(js);
    });
});
