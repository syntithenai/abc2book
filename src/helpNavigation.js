export var HELP_SECTION_SCROLL_OFFSET = 80;

export function helpSectionIdFromLink(link) {
  var value = String(link || '').trim();
  if (!value) return '';
  var hashIndex = value.indexOf('#');
  if (hashIndex === -1) return '';
  return value.slice(hashIndex + 1).replace(/^\/+/, '').trim();
}

export function scrollToHelpSection(id) {
  var sectionId = String(id || '').replace(/^#/, '').trim();
  if (!sectionId) return false;
  var el = document.getElementById(sectionId);
  if (!el) return false;
  var top = el.getBoundingClientRect().top + window.pageYOffset - HELP_SECTION_SCROLL_OFFSET;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  return true;
}

export function helpPathForSection(id) {
  var sectionId = String(id || '').replace(/^#/, '').trim();
  if (!sectionId) return '/help';
  return '/help#' + sectionId;
}
