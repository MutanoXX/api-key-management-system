/**
 * Logger colorido e organizado para o sistema
 */

export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',

  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    crimson: '\x1b[38m',
  },

  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',
  },
};

export const LogLevels = {
  INFO: { symbol: 'ℹ️', color: colors.fg.cyan },
  SUCCESS: { symbol: '✅', color: colors.fg.green },
  WARNING: { symbol: '⚠️', color: colors.fg.yellow },
  ERROR: { symbol: '❌', color: colors.fg.red },
  DEBUG: { symbol: '🔍', color: colors.fg.dim },
  API: { symbol: '🌐', color: colors.fg.blue },
  DB: { symbol: '💾', color: colors.fg.magenta },
  AUTH: { symbol: '🔐', color: colors.fg.crimson },
  NETWORK: { symbol: '📡', color: colors.fg.blue },
  SECURITY: { symbol: '🛡️', color: colors.fg.red },
};

export class Logger {
  constructor(prefix = 'SYSTEM') {
    this.prefix = prefix;
  }

  getTimestamp() {
    const now = new Date();
    const timestamp = now.toISOString();
    return `${colors.dim}${timestamp}${colors.reset}`;
  }

  format(level, category, message, data = null) {
    const { symbol, color } = LogLevels[level] || LogLevels.INFO;
    const timestamp = this.getTimestamp();

    let logMessage = `${timestamp} ${color}${symbol} ${colors.bright}[${category}]${colors.reset} ${message}`;

    if (data) {
      const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
      logMessage += `\n${colors.dim}┌──────────────────────────────────────${colors.reset}\n`;
      logMessage += `${colors.dim}│${colors.reset} ${dataStr}\n`;
      logMessage += `${colors.dim}└──────────────────────────────────────${colors.reset}`;
    }

    return logMessage;
  }

  info(category, message, data) {
    console.log(this.format('INFO', category, message, data));
  }

  success(category, message, data) {
    console.log(this.format('SUCCESS', category, message, data));
  }

  warning(category, message, data) {
    console.log(this.format('WARNING', category, message, data));
  }

  error(category, message, data) {
    console.error(this.format('ERROR', category, message, data));
  }

  debug(category, message, data) {
    if (process.env.DEBUG === 'true') {
      console.log(this.format('DEBUG', category, message, data));
    }
  }

  api(method, endpoint, status, duration) {
    const timestamp = this.getTimestamp();
    const statusColor = status >= 200 && status < 300 ? colors.fg.green :
                      status >= 300 && status < 400 ? colors.fg.yellow :
                      colors.fg.red;

    console.log(
      `${timestamp} ${colors.fg.blue}🌐 ${colors.bright}[API]${colors.reset} ` +
      `${colors.fg.cyan}${method}${colors.reset} ${endpoint} → ` +
      `${statusColor}${status}${colors.reset} (${colors.dim}${duration}ms${colors.reset})`
    );
  }

  auth(action, details) {
    const timestamp = this.getTimestamp();
    console.log(
      `${timestamp} ${colors.fg.crimson}🔐 ${colors.bright}[AUTH]${colors.reset} ` +
      `${colors.fg.yellow}${action}${colors.reset} ${details}`
    );
  }

  db(operation, details) {
    const timestamp = this.getTimestamp();
    console.log(
      `${timestamp} ${colors.fg.magenta}💾 ${colors.bright}[DB]${colors.reset} ` +
      `${operation} ${details}`
    );
  }

  security(event, details) {
    const timestamp = this.getTimestamp();
    console.log(
      `${timestamp} ${colors.fg.red}🛡️ ${colors.bright}[SECURITY]${colors.reset} ` +
      `${colors.fg.yellow}${event}${colors.reset} ${details}`
    );
  }

  request(req) {
    const timestamp = this.getTimestamp();
    const methodColor = req.method === 'GET' ? colors.fg.green :
                      req.method === 'POST' ? colors.fg.blue :
                      req.method === 'PUT' ? colors.fg.yellow :
                      req.method === 'DELETE' ? colors.fg.red :
                      colors.fg.cyan;

    console.log(
      `${timestamp} ${colors.fg.cyan}➡️  ${colors.bright}[REQUEST]${colors.reset} ` +
      `${methodColor}${req.method}${colors.reset} ${colors.dim}${req.path}${colors.reset}`
    );
  }

  response(res, duration) {
    const timestamp = this.getTimestamp();
    const statusColor = res.statusCode >= 200 && res.statusCode < 300 ? colors.fg.green :
                      res.statusCode >= 300 && res.statusCode < 400 ? colors.fg.yellow :
                      res.statusCode >= 400 && res.statusCode < 500 ? colors.fg.crimson :
                      colors.fg.red;

    console.log(
      `${timestamp} ${colors.fg.cyan}⬅️  ${colors.bright}[RESPONSE]${colors.reset} ` +
      `${statusColor}${res.statusCode}${colors.reset} ${colors.dim}(${duration}ms)${colors.reset}`
    );
  }

  separator(char = '═', length = 60) {
    console.log(colors.dim + char.repeat(length) + colors.reset);
  }

  banner(title, subtitle = '', version = '') {
    const bannerWidth = 60;
    const padding = ' '.repeat(Math.max(0, Math.floor((bannerWidth - title.length - 4) / 2)));

    console.log('');
    this.separator('═', bannerWidth);
    console.log(`${colors.fg.blue}╔${'═'.repeat(bannerWidth - 2)}╗${colors.reset}`);
    console.log(`${colors.fg.blue}║${colors.reset} ${colors.bright}${colors.fg.cyan}${title}${colors.reset}${padding} ${colors.fg.blue}║${colors.reset}`);

    if (subtitle) {
      const subtitlePadding = ' '.repeat(Math.max(0, Math.floor((bannerWidth - subtitle.length - 4) / 2)));
      console.log(`${colors.fg.blue}║${colors.reset} ${colors.dim}${subtitle}${subtitlePadding} ${colors.fg.blue}║${colors.reset}`);
    }

    if (version) {
      const versionPadding = ' '.repeat(Math.max(0, Math.floor((bannerWidth - version.length - 4) / 2)));
      console.log(`${colors.fg.blue}║${colors.reset} ${colors.dim}v${version}${versionPadding} ${colors.fg.blue}║${colors.reset}`);
    }

    console.log(`${colors.fg.blue}╚${'═'.repeat(bannerWidth - 2)}╝${colors.reset}`);
    this.separator('═', bannerWidth);
    console.log('');
  }

  section(title) {
    console.log('');
    console.log(`${colors.fg.blue}▶ ${colors.bright}${title}${colors.reset}`);
    this.separator('─', 40);
  }

  list(items, itemPrefix = '  • ') {
    items.forEach((item, index) => {
      if (typeof item === 'object') {
        const [key, value] = Object.entries(item)[0];
        console.log(`${itemPrefix}${colors.fg.cyan}${key}${colors.reset}: ${value}`);
      } else {
        console.log(`${itemPrefix}${item}`);
      }
    });
  }

  table(headers, rows) {
    const columnWidths = headers.map(h => Math.max(h.length, ...rows.map(r => String(r[headers.indexOf(h)]).length)));

    console.log('');

    // Header
    let headerRow = '┌';
    columnWidths.forEach(w => headerRow += '─'.repeat(w + 2) + '┬');
    headerRow = headerRow.slice(0, -1) + '┐';
    console.log(colors.dim + headerRow + colors.reset);

    const headerCells = headers.map((h, i) => ` ${colors.bright}${h}${colors.reset} `.padEnd(columnWidths[i] + 1));
    console.log(colors.dim + '│' + colors.reset + headerCells.join(colors.dim + '│' + colors.reset) + colors.dim + '│' + colors.reset);

    // Separator
    let separatorRow = '├';
    columnWidths.forEach(w => separatorRow += '─'.repeat(w + 2) + '┼');
    separatorRow = separatorRow.slice(0, -1) + '┤';
    console.log(colors.dim + separatorRow + colors.reset);

    // Data rows
    rows.forEach(row => {
      const cells = row.map((cell, i) => ` ${cell} `.padEnd(columnWidths[i] + 1));
      console.log(colors.dim + '│' + colors.reset + cells.join(colors.dim + '│' + colors.reset) + colors.dim + '│' + colors.reset);
    });

    // Footer
    let footerRow = '└';
    columnWidths.forEach(w => footerRow += '─'.repeat(w + 2) + '┴');
    footerRow = footerRow.slice(0, -1) + '┘';
    console.log(colors.dim + footerRow + colors.reset);
    console.log('');
  }
}

export const logger = new Logger('API-KEY-SYSTEM');
