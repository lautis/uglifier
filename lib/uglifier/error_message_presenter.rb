# Generates an error message given the result and source
class ErrorMessagePresenter
  def initialize(result, source, harmony, error_context_lines)
    @source = source
    @error = result['error']
    @harmony = harmony
    @error_context_lines = error_context_lines
  end

  def error_message
    message = @error['message']
    message += harmony_error_message(message)

    error_line_number = @error['line']
    message += " (#{error_line_number}:#{@error['col']})"

    if !error_line_number.nil? && @error_context_lines > 0
      lines = surrounding_source_lines(error_line_number)
      message += "\nSource:\n#{lines}\n"
    end

    message
  end

  private

  def harmony_error_message(message)
    return '' unless message.start_with?("Unexpected token") && !@harmony
    ". To use ES6 syntax, harmony mode must be enabled with " \
        "Uglifier.new(:harmony => true)."
  end

  def surrounding_source_lines(error_line_number)
    first_line = [0, error_line_number - @error_context_lines].max
    source_lines = @source.lines.to_a[first_line..error_line_number + @error_context_lines]

    lines = source_lines.map.with_index do |current_line, i|
      current_line_number = first_line + i + 1

      if current_line_number == error_line_number
        wrap_color("#{current_line_indicator(current_line_number)}: #{current_line}", 31)
      else
        "#{current_line_number}: #{current_line}"
      end
    end
    lines.join
  end

  def current_line_indicator(current_line_number)
    '=' * (current_line_number.to_s.length - 1) + '>'
  end

  def wrap_color(message, color_code)
    "\e[#{color_code}m#{message}\e[0m"
  end
end
