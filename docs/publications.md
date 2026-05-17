---
layout: default
title: Publications
nav_order: 3
permalink: /publications/
---
{%- comment -%}
=====================================================================
Publications page — driven by /public/publications.csv

The CSV lives in /public/ so that it is publicly accessible at
https://erhun.me/public/publications.csv. Jekyll loads it as
`site.data.publications` because `data_dir: public` is set in _config.yml.

The CSV has one row per publication with columns:
  Type, Authors, Title, Venue, Volume, Issue, Pages, Year,
  Publisher, Editors, DOI/URL, Source Code, Template

To add a new publication, append a row to the CSV and pick a Template:
  journal_article      — JP and special-issue items (linked title in
                         quotes, italic venue, vol/no/pp/year)
  book_chapter         — Springer/IDEA-style chapter where the chapter
                         title appears at the end after "ch. ..."
  book_chapter_fields  — AMS Fields Institute (sentence-period structure
                         after book title; used once)
  in_book              — AMS CRM "ser." chapter (in-quotes title + "in
                         BookTitle, ser. Series, Eds., vol., Publisher")
  conference           — "Title," in Proceedings of X[, Eds.][, vol.][,
                         year][, pp. ...]
  conference_book      — "Title," in BookTitle, ser. Series. Publisher,
                         year, pp. ...
  edited_proceedings   — Authors, Eds. Title, year. (used once)
  edited_volume        — Authors, Eds., Title, no. N, Publisher, year.

The "Authors" cell is a comma-separated list. The template auto-converts
"O. E. Kundakcioglu" to "O.&nbsp;E.&nbsp;Kundakcioglu" and joins authors
with Oxford-comma + "and" formatting.
=====================================================================
{%- endcomment -%}

# Publications
{: .no_toc }

{% assign jp = site.data.publications | where: "Type", "JP" %}
{% assign cp = site.data.publications | where: "Type", "CP" %}
{% assign eb = site.data.publications | where: "Type", "EB" %}

## Journal Articles

<ul>
{% for row in jp %}{% include cite.html row=row %}{% endfor %}
</ul>

## Conference Proceedings and Book Chapters

<ul>
{% for row in cp %}{% include cite.html row=row %}{% endfor %}
</ul>

## Edited Books and Special Issues

<ul>
{% for row in eb %}{% include cite.html row=row %}{% endfor %}
</ul>
