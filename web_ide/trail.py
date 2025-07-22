def is_palindrome(text):
    # Remove spaces and convert to lowercase for uniformity
    cleaned_text = ''.join(char.lower() for char in text if char.isalnum())
    return cleaned_text == cleaned_text[::-1]

# Example usage
text = input("Enter a string: ")

is_palindrome = is_palindrome_string(text)
if is_palindrome:
    print("The string is a palindrome.")
else:
    print("The string is not a palindrome.")