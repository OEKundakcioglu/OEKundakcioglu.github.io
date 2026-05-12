---
layout: default
title: Publications
nav_order: 3
permalink: /publications/
---
{%- comment -%}
=====================================================================
Publications page — driven by /pdf/publications.csv

The CSV lives in /pdf/ so that it is publicly accessible at
https://erhun.me/pdf/publications.csv. Jekyll loads it as
`site.data.publications` because `data_dir: pdf` is set in _config.yml.

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

{%- comment -%} Pre-compute the three groups so the Liquid loop bodies stay readable. {%- endcomment -%}
{%- assign jp = site.data.publications | where: "Type", "JP" -%}
{%- assign cp = site.data.publications | where: "Type", "CP" -%}
{%- assign eb = site.data.publications | where: "Type", "EB" -%}

## Journal Articles
 
{% for row in jp %}{% include cite.html row=row %}{% endfor %}
## Conference Proceedings and Book Chapters

{% for row in cp %}{% include cite.html row=row %}{% endfor %}
## Edited Books and Special Issues

{% for row in eb %}{% include cite.html row=row %}{% endfor %}
