#!/bin/sh
set -eu

usage() {
    echo "Usage: $0 ABSOLUTE_PROJECT_ROOT" >&2
    exit 2
}

[ "$#" -eq 1 ] || usage
project_root=$1
case "$project_root" in
    /*) ;;
    *) echo "ERROR: project root must be an absolute path: $project_root" >&2; exit 2 ;;
esac
[ -d "$project_root" ] || { echo "ERROR: project root is not a directory: $project_root" >&2; exit 2; }

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
skill_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
template_dir=$skill_dir/templates

agents_template=$template_dir/AGENTS.block.md
memory_skill_template=$template_dir/project-memory.SKILL.md
memory_template=$template_dir/MEMORY.md
bloat_skill_template=$template_dir/project-memory-bloat-check.SKILL.md

for template in "$agents_template" "$memory_skill_template" "$memory_template" "$bloat_skill_template"; do
    [ -f "$template" ] || { echo "ERROR: missing template: $template" >&2; exit 1; }
done

agents_file=$project_root/AGENTS.md
memory_dir=$project_root/.pi/skills/project-memory
bloat_dir=$project_root/.pi/skills/project-memory-bloat-check
memory_skill=$memory_dir/SKILL.md
memory_file=$memory_dir/MEMORY.md
bloat_skill=$bloat_dir/SKILL.md
start_marker='<!-- project-memory:start -->'
end_marker='<!-- project-memory:end -->'

# Validate managed markers before creating or changing anything.
marker_state=absent
if [ -e "$agents_file" ] || [ -L "$agents_file" ]; then
    [ -f "$agents_file" ] || { echo "ERROR: AGENTS.md exists but is not a regular file: $agents_file" >&2; exit 1; }
    marker_counts=$(awk -v start="$start_marker" -v end="$end_marker" '
        {
            rest = $0
            while ((at = index(rest, start)) != 0) {
                starts++
                if (!first_start) first_start = NR
                rest = substr(rest, at + length(start))
            }
            rest = $0
            while ((at = index(rest, end)) != 0) {
                ends++
                if (!first_end) first_end = NR
                rest = substr(rest, at + length(end))
            }
        }
        END { print starts + 0, ends + 0, first_start + 0, first_end + 0 }
    ' "$agents_file")
    set -- $marker_counts
    if [ "$1" -eq 0 ] && [ "$2" -eq 0 ]; then
        marker_state=absent
    elif [ "$1" -eq 1 ] && [ "$2" -eq 1 ] && [ "$3" -lt "$4" ]; then
        marker_state=valid
    else
        echo "ERROR: malformed project-memory markers in $agents_file (start=$1, end=$2). No files were changed." >&2
        exit 1
    fi
fi

for target in "$memory_skill" "$memory_file" "$bloat_skill"; do
    if { [ -e "$target" ] || [ -L "$target" ]; } && [ ! -f "$target" ]; then
        echo "ERROR: target exists but is not a regular file: $target. No files were changed." >&2
        exit 1
    fi
done

mkdir -p -- "$memory_dir" "$bloat_dir"

create_or_preserve() {
    source_file=$1
    target_file=$2
    if [ -e "$target_file" ] || [ -L "$target_file" ]; then
        echo "PRESERVED $target_file"
    else
        cp -- "$source_file" "$target_file"
        echo "CREATED $target_file"
    fi
}

create_or_preserve "$memory_skill_template" "$memory_skill"
create_or_preserve "$memory_template" "$memory_file"
create_or_preserve "$bloat_skill_template" "$bloat_skill"

if [ ! -e "$agents_file" ] && [ ! -L "$agents_file" ]; then
    cp -- "$agents_template" "$agents_file"
    echo "CREATED $agents_file"
elif [ "$marker_state" = valid ]; then
    echo "PRESERVED $agents_file"
else
    if [ -s "$agents_file" ]; then
        # Ensure the appended block starts on a new line, then separate it from existing content.
        if [ "$(tail -c 1 -- "$agents_file" | wc -l | tr -d ' ')" -eq 0 ]; then
            printf '\n' >> "$agents_file"
        fi
        printf '\n' >> "$agents_file"
    fi
    cat -- "$agents_template" >> "$agents_file"
    echo "UPDATED $agents_file"
fi
