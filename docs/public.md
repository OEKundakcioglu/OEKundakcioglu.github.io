---
layout: default
title: Public
lang: en
nav_order: 0
nav_exclude: true
---

# Public Files
<h2>Contents</h2>
<ul>
{% assign folder_name = "public" %}
{% for file in site.static_files %}
  {% if file.path contains folder_name %}
    <li><a href="{{ file.path | relative_url }}">{{ file.path | split: "/" | last }}</a></li>
  {% endif %}
{% endfor %}
</ul>
