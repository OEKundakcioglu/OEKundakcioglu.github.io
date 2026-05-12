---
layout: default
title: Public
nav_order: 0
nav_exclude: true
permalink: /public/
---

# Public Files
<h2>Contents</h2>
<ul>
{% for file in site.static_files %}
  {% if file.path contains "/public/" %}
    <li><a href="{{ file.path | relative_url }}">{{ file.path | split: "/" | last }}</a></li>
  {% endif %}
{% endfor %}
</ul>
