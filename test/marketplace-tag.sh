#!/bin/sh
# The marketplace entry, once it points at a release, names a tag of this repository and that tag's commit (ADR 0031):
# a tag that is not there installs nothing, and a commit that is not the tag's installs something else. Asked of the
# repository itself, since a checkout in CI fetches no tags. While the entry's source is "./", there is nothing to ask.
# test/readme.test.ts holds the entry's shape: this repository's URL, the tag of the version plugin.json gives.
#
#   sh test/marketplace-tag.sh
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
# Three words, or none where the source is a path.
said=$(node --input-type=module -e "
import { readFileSync } from 'node:fs';
const source = JSON.parse(readFileSync('$root/.claude-plugin/marketplace.json', 'utf8')).plugins[0].source;
if (typeof source !== 'string') console.log(source.url, source.ref, source.sha);
")
if [ -z "$said" ]; then
  echo "== the marketplace entry's source is a path: no tag to check"
  exit 0
fi
set -- $said
url=$1 ref=$2 sha=$3
# An annotated tag is listed twice, the second as the commit it points at; a lightweight one once.
found=$(git ls-remote --tags "$url" "refs/tags/$ref" "refs/tags/$ref^{}" | awk '{ print $1 }' | tail -n 1)
if [ -z "$found" ]; then
  echo "== $url has no tag $ref" >&2
  exit 1
fi
if [ "$found" != "$sha" ]; then
  echo "== $ref is $found in $url, and the marketplace entry names $sha" >&2
  exit 1
fi
echo "== $ref is $sha in $url"
