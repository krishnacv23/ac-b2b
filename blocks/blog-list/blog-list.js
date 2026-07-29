import { createOptimizedPicture, readBlockConfig } from '../../scripts/aem.js';
import { fetchIndex, rootLink } from '../../scripts/commerce.js';

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function toTimestamp(value) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function normalizeRecord(record) {
  return {
    ...record,
    path: record.path || '',
    title: record.title || '',
    description: record.description || '',
    image: record.image || '',
    blogCategory: record.blogCategory || '',
    blogTags: toArray(record.blogTags),
    author: record.author || '',
    authorSlug: record.authorSlug || '',
    publicationDate: record.publicationDate || '',
    template: record.template || '',
  };
}

function applyFilters(posts, config) {
  let result = posts.filter((post) => post.template === 'blog-article');

  if (config.category) {
    const category = config.category.toLowerCase();
    result = result.filter((post) => post.blogCategory.toLowerCase() === category);
  }

  if (config.author) {
    const author = config.author.toLowerCase();
    result = result.filter(
      (post) => post.author.toLowerCase() === author || post.authorSlug.toLowerCase() === author,
    );
  }

  if (config.tag) {
    const tag = config.tag.toLowerCase();
    result = result.filter((post) => post.blogTags.some((item) => item.toLowerCase() === tag));
  }

  const sortValue = (config.sort || 'publication-date:desc').toLowerCase();
  const ascending = sortValue.endsWith(':asc');

  result.sort((a, b) => {
    const delta = toTimestamp(a.publicationDate) - toTimestamp(b.publicationDate);
    return ascending ? delta : -delta;
  });

  if (config.limit) {
    const limit = Number.parseInt(config.limit, 10);
    if (!Number.isNaN(limit) && limit > 0) {
      result = result.slice(0, limit);
    }
  }

  return result;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function buildTagChip(tag) {
  const anchor = document.createElement('a');
  anchor.className = 'blog-list__chip';
  anchor.href = rootLink(`/blog/tags/${encodeURIComponent(tag)}`);
  anchor.textContent = tag;
  return anchor;
}

function buildCategoryChip(category) {
  const anchor = document.createElement('button');
  anchor.type = 'button';
  anchor.className = 'blog-list__chip';
  anchor.textContent = category;
  anchor.dataset.category = category;
  return anchor;
}

function createCard(post) {
  const card = document.createElement('article');
  card.className = 'blog-list__card';

  const link = document.createElement('a');
  link.className = 'blog-list__card-link';
  link.href = rootLink(`/${post.path.replace(/^\/+/, '')}`);

  if (post.image) {
    const picture = createOptimizedPicture(post.image, post.title, false, [{ width: '750' }]);
    picture.classList.add('blog-list__image');
    link.append(picture);
  }

  const content = document.createElement('div');
  content.className = 'blog-list__content';

  const meta = document.createElement('p');
  meta.className = 'blog-list__meta';
  const metaParts = [
    post.blogCategory,
    formatDate(post.publicationDate),
    post.author,
  ].filter(Boolean);
  meta.textContent = metaParts.join(' \u2022 ');
  if (meta.textContent) {
    content.append(meta);
  }

  const title = document.createElement('h3');
  title.className = 'blog-list__title';
  title.textContent = post.title;
  content.append(title);

  if (post.description) {
    const description = document.createElement('p');
    description.className = 'blog-list__description';
    description.textContent = post.description;
    content.append(description);
  }

  if (post.blogTags.length) {
    const tags = document.createElement('div');
    tags.className = 'blog-list__tags';
    post.blogTags.slice(0, 3).forEach((tag) => tags.append(buildTagChip(tag)));
    content.append(tags);
  }

  link.append(content);
  card.append(link);
  return card;
}

function renderEmptyState(container) {
  const empty = document.createElement('p');
  empty.className = 'blog-list__empty';
  empty.textContent = 'No blog posts found for the selected filters.';
  container.append(empty);
}

function renderCategoryChips(root, categories, activeCategory, onClick) {
  if (!categories.length || activeCategory) return;
  const chips = document.createElement('div');
  chips.className = 'blog-list__chips';

  categories.forEach((category) => {
    const chip = buildCategoryChip(category);
    chip.addEventListener('click', () => onClick(category));
    chips.append(chip);
  });

  root.append(chips);
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const index = await fetchIndex('blog-index');
  const posts = (index.data || []).map(normalizeRecord);
  const categories = [...new Set(posts.map((post) => post.blogCategory).filter(Boolean))];

  const wrapper = document.createElement('div');
  wrapper.className = 'blog-list';
  const list = document.createElement('div');
  list.className = 'blog-list__grid';
  wrapper.append(list);

  const render = (categoryOverride = '') => {
    list.innerHTML = '';
    const filtered = applyFilters(posts, {
      ...config,
      category: categoryOverride || config.category || '',
    });

    if (!filtered.length) {
      renderEmptyState(list);
      return;
    }
    filtered.forEach((post) => list.append(createCard(post)));
  };

  renderCategoryChips(wrapper, categories, config.category, (category) => {
    wrapper.querySelectorAll('.blog-list__chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.category === category);
    });
    render(category);
  });

  block.innerHTML = '';
  block.append(wrapper);
  render();
}
