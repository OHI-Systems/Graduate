const APP = Object.freeze({
  NAME: 'Graduate Tracking System',
  SPREADSHEET_ID: '1mtf_0zke9rrcEY-lSYWokQLq1fAAImyjqM7zXyYe7oo',
  BASIC_SHEET: 'البيانات الأساسية',
  CAREER_SHEET: 'البيانات العلمية والوظيفية',
  HEADER_ROW: 1,
  FIRST_DATA_ROW: 2,
  SESSION_TTL_SECONDS: 21600
});

const BASIC_FIELDS = [
  {key:'معرّف الخريج (الكود)', label:'كود الخريج', type:'text', required:true, english:true},
  {key:'الاسم بالعربية', label:'الاسم بالعربية', type:'text', required:true},
  {key:'الاسم بالإنجليزية', label:'الاسم بالإنجليزية', type:'text', english:true},
  {key:'البريد الإلكتروني', label:'البريد الإلكتروني', type:'email', english:true},
  {key:'النوع', label:'النوع', type:'choice', options:['ذكر','أنثى']},
  {key:'الديانة', label:'الديانة', type:'choice', options:['مسلم','مسيحي','أخرى','غير محدد']},
  {key:'الجنسية', label:'الجنسية', type:'text'},
  {key:'تاريخ الميلاد', label:'تاريخ الميلاد', type:'date'},
  {key:'محل الميلاد', label:'محل الميلاد', type:'text'},
  {key:'محافظة السكن', label:'محافظة السكن', type:'text'},
  {key:'محافظة الميلاد', label:'محافظة الميلاد', type:'text'},
  {key:'الرقم القومي', label:'الرقم القومي', type:'text', english:true},
  {key:'العنوان', label:'العنوان', type:'text'},
  {key:'تليفون المنزل', label:'تليفون المنزل', type:'text', english:true},
  {key:'المحمول', label:'المحمول', type:'text', english:true},
  {key:'الرقم العسكري', label:'الرقم العسكري', type:'text', english:true},
  {key:'عام الالتحاق', label:'عام الالتحاق', type:'year', english:true}
];

const CAREER_FIELDS = [
  {key:'معرّف الخريج (الكود)', label:'كود الخريج', type:'text', required:true, english:true},
  {key:'المؤهل السابق', label:'المؤهل السابق', type:'text'},
  {key:'المعدل التراكمي', label:'المعدل التراكمي', type:'number', english:true},
  {key:'التقدير', label:'التقدير', type:'text'},
  {key:'التقدير العام', label:'التقدير العام', type:'text'},
  {key:'البرنامج', label:'البرنامج', type:'text'},
  {key:'الدرجة العظمى', label:'الدرجة العظمى', type:'number', english:true},
  {key:'تقدير المشروع', label:'تقدير المشروع', type:'text'},
  {key:'تقدير المشروع العام', label:'تقدير المشروع العام', type:'text'},
  {key:'الساعات المكتسبة', label:'الساعات المكتسبة', type:'number', english:true},
  {key:'التربية العسكرية', label:'التربية العسكرية', type:'choice', options:['اجتاز','لم يجتز','غير منطبق']},
  {key:'المجموع', label:'المجموع', type:'number', english:true},
  {key:'النسبة', label:'النسبة', type:'percent', english:true},
  {key:'دور التخرج', label:'دور التخرج', type:'choice', options:['مايو','أكتوبر','دور أول','دور ثان']},
  {key:'سنة التخرج', label:'سنة التخرج', type:'year', english:true},
  {key:'جهة العمل الحالية', label:'جهة العمل الحالية', type:'text'},
  {key:'المسمى الوظيفي', label:'المسمى الوظيفي', type:'text'},
  {key:'تاريخ بداية العمل', label:'تاريخ بداية العمل', type:'date'},
  {key:'الكورسات', label:'الكورسات', type:'text'},
  {key:'الدراسات العليا', label:'الدراسات العليا', type:'text'}
];

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Graduate Tracking System | نظام متابعة الخريجين')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Username/password sign-in for system users. */
function apiLogin(usernameInput, passwordInput) {
  const username = normalizeUsername_(usernameInput);
  const password = String(passwordInput === null || passwordInput === undefined ? '' : passwordInput);
  const users = ensureUsersSheet_();
  if (!users.length) throw new Error('لم يُهيأ حساب المدير بعد. اضبط ADMIN_PASSWORD في Script Properties ثم أعد المحاولة.');
  const cache = CacheService.getScriptCache();
  const attemptKey = 'gts-login:' + hash_(username || 'empty');
  const attempts = Number(cache.get(attemptKey) || 0);
  if (attempts >= 5) throw new Error('محاولات دخول كثيرة. انتظر 15 دقيقة ثم حاول مرة أخرى.');
  const user = users.find(function(u){return u.username === username;});
  if (!user || !user.active || !password || hashPassword_(password, user.salt) !== user.passwordHash) {
    cache.put(attemptKey, String(attempts + 1), 900);
    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
  }
  cache.remove(attemptKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('gts-session-v4:' + hash_(token), JSON.stringify({username:username, name:user.name, role:user.role, passwordHash:user.passwordHash}), APP.SESSION_TTL_SECONDS);
  return {ok:true, token:token, username:username, name:user.name, role:user.role};
}

function apiLogout(token) {
  if (token) CacheService.getScriptCache().remove('gts-session-v4:' + hash_(String(token)));
  return {ok:true};
}
function apiBootstrap(token) {
  const auth = requireSession_(token);
  const basic = readTable_(APP.BASIC_SHEET, BASIC_FIELDS);
  const career = readTable_(APP.CAREER_SHEET, CAREER_FIELDS);
  const careerById = indexRows_(career.rows, career.fields);
  const records = basic.rows.map(function(entry){
    const item = rowObject_(basic.fields, entry.values);
    const job = careerById[item['معرّف الخريج (الكود)']] || {};
    return summaryRecord_(item, job);
  });
  return {
    role:auth.role, username:auth.username, name:auth.name, canManageUsers:auth.role === 'admin',
    stats:{total:records.length, employed:records.filter(function(x){return !!x.employer;}).length, postgraduate:records.filter(function(x){return !!x.postgraduate;}).length},
    recent:records.slice(-10).reverse(), basicFields:publicFieldDefs_(BASIC_FIELDS), careerFields:publicFieldDefs_(CAREER_FIELDS)
  };
}
function apiReportData(token, filters) {
  const auth = requireSession_(token);
  filters = filters || {};
  const basic = readTable_(APP.BASIC_SHEET, BASIC_FIELDS);
  const career = readTable_(APP.CAREER_SHEET, CAREER_FIELDS);
  const careerById = indexRows_(career.rows, career.fields);
  const year = cleanText_(filters.year);
  const program = cleanText_(filters.program);
  const employment = cleanText_(filters.employment || 'all');
  let rows = basic.rows.map(function(entry){
    const b = rowObject_(BASIC_FIELDS, entry.values);
    const c = careerById[b['معرّف الخريج (الكود)']] || {};
    return summaryRecord_(b,c);
  });
  if (year) rows = rows.filter(function(r){return String(r.year) === year;});
  if (program) rows = rows.filter(function(r){return r.program === program;});
  if (employment === 'employed') rows = rows.filter(function(r){return !!cleanText_(r.employer);});
  if (employment === 'notEmployed') rows = rows.filter(function(r){return !cleanText_(r.employer);});
  rows.sort(function(a,b){return String(a.name).localeCompare(String(b.name),'ar');});
  return {
    generatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
    preparedBy: auth.name || auth.username,
    filters:{year:year, program:program, employment:employment},
    programs:Array.from(new Set(career.rows.map(function(e){return cleanText_(rowObject_(CAREER_FIELDS,e.values)['البرنامج']);}).filter(Boolean))).sort(),
    years:Array.from(new Set(career.rows.map(function(e){return String(rowObject_(CAREER_FIELDS,e.values)['سنة التخرج'] || '').trim();}).filter(Boolean))).sort(),
    stats:{total:rows.length, employed:rows.filter(function(r){return !!cleanText_(r.employer);}).length, postgraduate:rows.filter(function(r){return !!cleanText_(r.postgraduate);}).length},
    records:rows
  };
}
function apiListUsers(token) {
  requireRole_(token,'admin');
  return ensureUsersSheet_().map(function(u){return {username:u.username,name:u.name,role:u.role,active:u.active};});
}
function apiAddUser(token, input) {
  const actor = requireRole_(token,'admin');
  input = input || {};
  const username = normalizeUsername_(input.username);
  const name = cleanText_(input.name);
  const password = String(input.password || '');
  const role = input.role === 'admin' ? 'admin' : 'user';
  if (!/^[\p{L}\p{N}._-]{2,40}$/u.test(username)) throw new Error('اسم المستخدم من 2 إلى 40 حرفًا، ويمكن استخدام الحروف والأرقام والنقطة والشرطة.');
  if (!name || name.length > 100) throw new Error('الاسم الظاهر مطلوب وبحد أقصى 100 حرف.');
  if (password.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  const sh = usersSheet_();
  if (ensureUsersSheet_().some(function(u){return u.username === username;})) throw new Error('اسم المستخدم مسجل بالفعل.');
  const salt = passwordSalt_();
  sh.appendRow([username,name,salt,hashPassword_(password,salt),role,true,actor.username,new Date(),new Date()]);
  return {ok:true};
}
function apiSetUserPassword(token, usernameInput, passwordInput) {
  requireRole_(token,'admin');
  const username = normalizeUsername_(usernameInput), password = String(passwordInput || '');
  if (password.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  const user = ensureUsersSheet_().find(function(u){return u.username === username;});
  if (!user) throw new Error('المستخدم غير موجود.');
  const salt = passwordSalt_(), row = user.row;
  usersSheet_().getRange(row,3,1,2).setValues([[salt,hashPassword_(password,salt)]]);
  usersSheet_().getRange(row,9).setValue(new Date());
  return {ok:true};
}
function apiChangeUsername(token, currentPassword, newUsernameInput) {
  const actor = requireSession_(token);
  const currentUsername = actor.username, newUsername = normalizeUsername_(newUsernameInput);
  if (!/^[\p{L}\p{N}._-]{2,40}$/u.test(newUsername)) throw new Error('اسم المستخدم من 2 إلى 40 حرفًا، ويمكن استخدام الحروف والأرقام والنقطة والشرطة.');
  const users = ensureUsersSheet_(), user = users.find(function(u){return u.username === currentUsername;});
  if (!user || hashPassword_(String(currentPassword || ''),user.salt) !== user.passwordHash) throw new Error('كلمة المرور الحالية غير صحيحة.');
  if (users.some(function(u){return u.username === newUsername && u.username !== currentUsername;})) throw new Error('اسم المستخدم مستخدم بالفعل.');
  usersSheet_().getRange(user.row,1).setValue(newUsername);
  usersSheet_().getRange(user.row,9).setValue(new Date());
  return {ok:true, username:newUsername};
}
function apiSetUserActive(token, usernameInput, active) {
  const actor = requireRole_(token,'admin');
  const username = normalizeUsername_(usernameInput);
  const users = ensureUsersSheet_(), user = users.find(function(u){return u.username === username;});
  if (!user) throw new Error('المستخدم غير موجود.');
  if (!active && username === actor.username) throw new Error('لا يمكن إيقاف حسابك أثناء تسجيل الدخول.');
  if (!active && user.role === 'admin' && users.filter(function(u){return u.role === 'admin' && u.active;}).length <= 1) throw new Error('يجب إبقاء مدير نظام نشط واحد على الأقل.');
  usersSheet_().getRange(user.row,6).setValue(!!active);
  usersSheet_().getRange(user.row,9).setValue(new Date());
  return {ok:true};
}
function apiChangePassword(token, currentPassword, newPassword) {
  const auth = requireSession_(token), users = ensureUsersSheet_();
  const user = users.find(function(u){return u.username === auth.username;});
  const next = String(newPassword || '');
  if (!user || hashPassword_(String(currentPassword || ''),user.salt) !== user.passwordHash) throw new Error('كلمة المرور الحالية غير صحيحة.');
  if (next.length < 8) throw new Error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.');
  const salt = passwordSalt_();
  usersSheet_().getRange(user.row,3,1,2).setValues([[salt,hashPassword_(next,salt)]]);
  usersSheet_().getRange(user.row,9).setValue(new Date());
  return {ok:true};
}
function apiSearchGraduates(token, query) {
  requireSession_(token);
  const q = cleanText_(query).toLocaleLowerCase();
  const basic = readTable_(APP.BASIC_SHEET, BASIC_FIELDS);
  const career = readTable_(APP.CAREER_SHEET, CAREER_FIELDS);
  const careerById = indexRows_(career.rows, career.fields);
  const matches = [];
  basic.rows.forEach(function(entry) {
    const row=entry.values;
    const item = rowObject_(basic.fields, row);
    const id = item['معرّف الخريج (الكود)'];
    const job = careerById[id] || {};
    const searchable = row.join(' ').toLocaleLowerCase() + ' ' + Object.keys(job).map(function(k){return job[k];}).join(' ').toLocaleLowerCase();
    if (!q || searchable.indexOf(q) !== -1) matches.push(summaryRecord_(item, job));
  });
  return matches.slice(0,150);
}

function apiGetGraduate(token, graduateId) {
  requireSession_(token);
  const record = findGraduateById_(cleanText_(graduateId));
  if (!record) throw new Error('لم يتم العثور على سجل بهذا الكود.');
  return record;
}

function apiSaveGraduate(token, payload) {
  requireSession_(token);
  if (!payload || !payload.basic || !payload.career) throw new Error('بيانات النموذج غير مكتملة.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('هناك عملية حفظ أخرى. حاول بعد لحظات.');
  try {
    const basicTable = readTable_(APP.BASIC_SHEET, BASIC_FIELDS);
    const careerTable = readTable_(APP.CAREER_SHEET, CAREER_FIELDS);
    const basicId = cleanText_(payload.basic['معرّف الخريج (الكود)']);
    const careerId = cleanText_(payload.career['معرّف الخريج (الكود)']);
    if (!basicId || basicId.length > 32) throw new Error('كود الخريج مطلوب وبحد أقصى 32 حرفًا.');
    if (basicId !== careerId) throw new Error('يجب أن يتطابق كود الخريج في الشيتين.');
    if (!cleanText_(payload.basic['الاسم بالعربية'])) throw new Error('اسم الخريج بالعربية مطلوب.');
    const existingBasic = findRow_(basicTable, basicId);
    const existingCareer = findRow_(careerTable, basicId);
    const basicRow = mergeInputRow_(basicTable, existingBasic, payload.basic, BASIC_FIELDS, true);
    const careerRow = mergeInputRow_(careerTable, existingCareer, payload.career, CAREER_FIELDS, false);
    const basicSheet = basicTable.sheet;
    const careerSheet = careerTable.sheet;
    const basicTarget = existingBasic ? existingBasic.rowNumber : nextBlankRow_(basicTable);
    const careerTarget = existingCareer ? existingCareer.rowNumber : nextBlankRow_(careerTable);
    const oldBasic = existingBasic ? existingBasic.values : null;
    const oldCareer = existingCareer ? existingCareer.values : null;
    try {
      basicSheet.getRange(basicTarget,1,1,BASIC_FIELDS.length).setValues([basicRow]);
      careerSheet.getRange(careerTarget,1,1,CAREER_FIELDS.length).setValues([careerRow]);
      SpreadsheetApp.flush();
    } catch (writeErr) {
      rollbackRow_(basicSheet, basicTarget, BASIC_FIELDS.length, oldBasic);
      rollbackRow_(careerSheet, careerTarget, CAREER_FIELDS.length, oldCareer);
      SpreadsheetApp.flush();
      throw writeErr;
    }
    return {ok:true, id:basicId, message:existingBasic ? 'تم تحديث سجل الخريج.' : 'تمت إضافة سجل الخريج.'};
  } finally {
    lock.releaseLock();
  }
}

function requireRole_(token, role) {
  const auth = requireSession_(token);
  if (role === 'admin' && auth.role !== 'admin') throw new Error('هذه العملية متاحة لمدير النظام فقط.');
  return auth;
}

function requireSession_(token) {
  if (!token || typeof token !== 'string' || token.length < 32) throw new Error('سجّل الدخول للمتابعة.');
  const raw = CacheService.getScriptCache().get('gts-session-v4:' + hash_(token));
  if (!raw) throw new Error('انتهت الجلسة. سجّل الدخول مرة أخرى.');
  const auth = JSON.parse(raw);
  const current = ensureUsersSheet_().find(function(u){return u.username === auth.username;});
  if (!current || !current.active || current.role !== auth.role || current.passwordHash !== auth.passwordHash) throw new Error('تم إيقاف الحساب أو تغيير بياناته. سجّل الدخول مرة أخرى.');
  return auth;
}
const USERS_HEADERS_ = ['username','name','password_salt','password_hash','role','active','created_by','created_at','updated_at'];
function usersSheet_(){
  const sh = getSpreadsheet_().getSheetByName('مستخدمو النظام');
  if (!sh) throw new Error('تعذر إنشاء شيت مستخدمو النظام.');
  return sh;
}
function ensureUsersSheet_() {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName('مستخدمو النظام');
  if (!sh) {
    sh = ss.insertSheet('مستخدمو النظام');
    sh.appendRow(USERS_HEADERS_);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,USERS_HEADERS_.length).setBackground('#1F6174').setFontColor('#ffffff').setFontWeight('bold');
  }
  let headers = sh.getRange(1,1,1,USERS_HEADERS_.length).getDisplayValues()[0];
  const legacyEmailHeader = headers[0] === 'email' && headers.slice(1).join('|') === USERS_HEADERS_.slice(1).join('|');
  if (legacyEmailHeader) {
    const oldLast = sh.getLastRow(), used = Object.create(null), roleCounts = {admin:0,user:0};
    if (oldLast >= 2) {
      const oldRows = sh.getRange(2,1,oldLast-1,USERS_HEADERS_.length).getValues();
      oldRows.forEach(function(row){
        const role = row[4] === 'admin' ? 'admin' : 'user';
        roleCounts[role]++;
        const base = role === 'admin' ? (roleCounts[role] === 1 ? 'admin' : 'admin' + roleCounts[role]) : 'user' + roleCounts[role];
        const username = uniqueUsername_(base,used);
        const oldIdentity = cleanText_(row[0]);
        row[0] = username;
        if (!cleanText_(row[1]) || normalizeEmail_(row[1]) === normalizeEmail_(oldIdentity)) row[1] = role === 'admin' ? 'مدير النظام' : 'مستخدم';
        if (String(row[6] || '').indexOf('@') >= 0) row[6] = 'migration';
      });
      sh.getRange(2,1,oldRows.length,USERS_HEADERS_.length).setValues(oldRows);
    }
    sh.getRange(1,1,1,USERS_HEADERS_.length).setValues([USERS_HEADERS_]);
    headers = USERS_HEADERS_;
  }
  if (headers.join('|') !== USERS_HEADERS_.join('|')) throw new Error('عناوين شيت مستخدمو النظام لا تطابق القالب.');
  if (sh.getLastRow() < 2) {
    const props = PropertiesService.getScriptProperties();
    const password = props.getProperty('ADMIN_PASSWORD') || '';
    const adminUsername = normalizeUsername_(props.getProperty('ADMIN_USERNAME') || 'admin');
    if (password) {
      if (!/^[\p{L}\p{N}._-]{2,40}$/u.test(adminUsername)) throw new Error('ADMIN_USERNAME يجب أن يكون من 2 إلى 40 حرفًا أو رقمًا.');
      const salt = passwordSalt_();
      sh.getRange(2,1,1,USERS_HEADERS_.length).setValues([[adminUsername,'مدير النظام',salt,hashPassword_(password,salt),'admin',true,'bootstrap',new Date(),new Date()]]);
    }
  }
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2,1,last-1,USERS_HEADERS_.length).getValues().map(function(r,i){return {username:normalizeUsername_(r[0]),name:cleanText_(r[1]),salt:String(r[2]||''),passwordHash:String(r[3]||''),role:r[4]==='admin'?'admin':'user',active:r[5]===true || String(r[5]).toLowerCase()==='true' || String(r[5])==='1',createdBy:String(r[6]||''),createdAt:r[7],row:i+2};}).filter(function(u){return !!u.username;});
}
function uniqueUsername_(base,used){
  let username=normalizeUsername_(base),suffix=2;
  while(used[username]){username=normalizeUsername_(base+'_'+suffix);suffix++;}
  used[username]=true;
  return username;
}
function passwordSalt_(){return Utilities.getUuid()+Utilities.getUuid();}
function hashPassword_(password,salt){
  let value=hash_(String(salt)+':'+String(password));
  for(let i=1;i<2000;i++) value=hash_(String(salt)+':'+value+':'+i);
  return value;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(APP.SPREADSHEET_ID);
}

function readTable_(sheetName, fields) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error('الشيت المطلوب غير موجود: ' + sheetName);
  const expected = fields.map(function(f){return f.key;});
  const headers = sheet.getRange(APP.HEADER_ROW,1,1,expected.length).getDisplayValues()[0];
  const mismatch = expected.findIndex(function(h,i){return String(headers[i] || '').trim() !== h;});
  if (mismatch >= 0) throw new Error('عناوين أعمدة الشيت «' + sheetName + '» لا تطابق القالب عند العمود ' + (mismatch+1) + '.');
  const last = Math.max(sheet.getLastRow(), APP.HEADER_ROW);
  const count = Math.max(0,last-APP.FIRST_DATA_ROW+1);
  const rows = count ? sheet.getRange(APP.FIRST_DATA_ROW,1,count,expected.length).getValues().map(function(r,i){return {values:r.map(function(v,j){return formatCell_(v,fields[j]);}),rowNumber:APP.FIRST_DATA_ROW+i};}).filter(function(entry){return cleanText_(entry.values[0]) !== '';}) : [];
  return {sheet:sheet, fields:fields, rows:rows};
}

function findGraduateById_(id) {
  const basic = readTable_(APP.BASIC_SHEET, BASIC_FIELDS);
  const career = readTable_(APP.CAREER_SHEET, CAREER_FIELDS);
  const b = findRow_(basic, id);
  if (!b) return null;
  const c = findRow_(career, id);
  return {basic:rowObject_(BASIC_FIELDS,b.values), career:c ? rowObject_(CAREER_FIELDS,c.values) : emptyRecord_(CAREER_FIELDS)};
}

function findRow_(table, id) {
  const target = cleanText_(id);
  for (let i=0;i<table.rows.length;i++) {
    if (cleanText_(table.rows[i].values[0]) === target) return {rowNumber:table.rows[i].rowNumber, values:table.rows[i].values};
  }
  return null;
}

function nextBlankRow_(table) {
  const sheet = table.sheet;
  const maxRows = sheet.getMaxRows();
  const n = Math.max(0,maxRows-APP.FIRST_DATA_ROW+1);
  if (n) {
    const ids = sheet.getRange(APP.FIRST_DATA_ROW,1,n,1).getDisplayValues();
    const blank = ids.findIndex(function(r){return !cleanText_(r[0]);});
    if (blank >= 0) return APP.FIRST_DATA_ROW + blank;
  }
  sheet.insertRowsAfter(maxRows, 1);
  return maxRows + 1;
}

function mergeInputRow_(table, existing, input, fields, requireName) {
  const obj = existing ? rowObject_(fields, existing.values) : emptyRecord_(fields);
  fields.forEach(function(field){
    if (Object.prototype.hasOwnProperty.call(input,field.key)) obj[field.key] = validateValue_(input[field.key],field);
  });
  if (requireName && !cleanText_(obj['الاسم بالعربية'])) throw new Error('اسم الخريج بالعربية مطلوب.');
  return fields.map(function(field){return safeCellValue_(obj[field.key],field);});
}

function validateValue_(value, field) {
  if (value === null || value === undefined || value === '') return '';
  const s = cleanText_(value);
  if (field.type === 'choice' && field.options.indexOf(s) === -1) throw new Error('قيمة غير صحيحة في «' + field.label + '».');
  if (field.type === 'email' && s && !isValidEmail_(s)) throw new Error('البريد الإلكتروني غير صحيح.');
  if (field.type === 'year' && s && (!/^\d{4}$/.test(s) || Number(s)<1950 || Number(s)>2100)) throw new Error('السنة غير صحيحة في «' + field.label + '».');
  if ((field.type === 'number' || field.type === 'percent') && s) {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0 || (field.type === 'percent' && n > 100)) throw new Error('القيمة الرقمية غير صحيحة في «' + field.label + '».');
    return n;
  }
  if (field.type === 'year' && s) return Number(s);
  if (field.type === 'date' && s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('التاريخ يجب أن يكون بصيغة YYYY-MM-DD في «' + field.label + '».');
    const date = new Date(s + 'T12:00:00');
    if (isNaN(date.getTime())) throw new Error('التاريخ غير صحيح في «' + field.label + '».');
    return date;
  }
  if (s.length > 2000) throw new Error('النص أطول من المسموح في «' + field.label + '».');
  return s;
}

function safeCellValue_(value, field) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'number') return value;
  const s = String(value);
  return s.charAt(0) === '=' ? "'" + s : s;
}

function rollbackRow_(sheet, row, width, previous) {
  if (previous) sheet.getRange(row,1,1,width).setValues([previous]);
  else sheet.getRange(row,1,1,width).clearContent();
}

function rowObject_(fields, values) {
  const out = {};
  fields.forEach(function(field,i){out[field.key]=values[i] === undefined ? '' : formatCell_(values[i],field);});
  return out;
}

function emptyRecord_(fields) {
  const out = {};
  fields.forEach(function(field){out[field.key]='';});
  return out;
}

function formatCell_(value, field) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return value === null || value === undefined ? '' : value;
}

function indexRows_(rows, fields) {
  const out = {};
  rows.forEach(function(entry){const obj=rowObject_(fields,entry.values);const id=cleanText_(obj['معرّف الخريج (الكود)']);if(id)out[id]=obj;});
  return out;
}

function summaryRecord_(basic, career) {
  return {
    id:basic['معرّف الخريج (الكود)'], name:basic['الاسم بالعربية'], englishName:basic['الاسم بالإنجليزية'],
    email:basic['البريد الإلكتروني'], program:career['البرنامج'] || '', year:career['سنة التخرج'] || '',
    employer:career['جهة العمل الحالية'] || '', jobTitle:career['المسمى الوظيفي'] || '', postgraduate:career['الدراسات العليا'] || ''
  };
}

function publicFieldDefs_(fields) {
  return fields.map(function(f){return {key:f.key,label:f.label,type:f.type,required:!!f.required,english:!!f.english,options:f.options || []};});
}

function cleanText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function normalizeEmail_(value) {
  return cleanText_(value).toLowerCase();
}

function normalizeUsername_(value) {
  return cleanText_(value).toLowerCase();
}

function isValidEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function hash_(value) {
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8);
  return bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}












